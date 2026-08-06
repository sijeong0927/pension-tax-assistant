from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from app.core.config import ConfigurationError, RAGSettings, get_rag_settings
from app.core.prompts import (
    NO_RELEVANT_CONTEXT_MESSAGE,
    RAG_DISCLAIMER,
    RAG_SYSTEM_PROMPT,
)
from app.core.vector_db import get_vector_collection
from app.models.rag import RAGAnswer, RAGSource
from app.services.hybrid_search import (
    HybridSearchError,
    hybrid_search,
)
from app.services.knowledge_base import (
    KnowledgeBaseReport,
    load_knowledge_base,
)

MAX_RETRIEVAL_DOCUMENTS = 8
MAX_INDEX_DOCUMENTS = 100
SOURCE_EXCERPT_MAX_LENGTH = 280


def _source_excerpt(text: str) -> str:
    """출처 카드에 표시할 수 있는 짧고 공백이 정리된 근거 발췌를 만든다."""
    normalized = " ".join(text.split())
    if len(normalized) <= SOURCE_EXCERPT_MAX_LENGTH:
        return normalized
    return f"{normalized[:SOURCE_EXCERPT_MAX_LENGTH].rstrip()}…"


class RAGServiceError(RuntimeError):
    """RAG 검색 또는 외부 API 연동이 실패했을 때 발생하는 예외."""


class KnowledgeBaseNotIndexedError(RAGServiceError):
    """ChromaDB에 지식 문서가 아직 적재되지 않았을 때 발생하는 예외."""


@dataclass(frozen=True)
class IndexingResult:
    indexed_count: int
    collection_name: str
    warnings: tuple[str, ...]


@dataclass(frozen=True)
class RetrievedDocument:
    document_id: str
    text: str
    title: str
    category: str
    source_title: str
    source_url: str
    effective_date: str
    last_verified: str
    source_chunk_ids: str
    provenance_verified: bool
    relevance_score: float

    def to_source(self) -> RAGSource:
        return RAGSource(
            document_id=self.document_id,
            title=self.title,
            category=self.category,
            source_title=self.source_title or None,
            source_url=self.source_url or None,
            effective_date=self.effective_date or None,
            last_verified=self.last_verified or None,
            source_chunk_ids=[
                chunk_id
                for chunk_id in self.source_chunk_ids.split(",")
                if chunk_id
            ],
            excerpt=_source_excerpt(self.text) or None,
            provenance_verified=self.provenance_verified,
            relevance_score=self.relevance_score,
        )


class RAGService:
    def __init__(
        self,
        *,
        settings: RAGSettings | None = None,
        openai_client: Any | None = None,
        chroma_client: Any | None = None,
        collection: Any | None = None,
    ) -> None:
        self.settings = settings or get_rag_settings()
        self._openai_client = openai_client
        self._chroma_client = chroma_client
        self._collection = collection

    def _get_openai_client(self) -> Any:
        if self._openai_client is None:
            from openai import OpenAI

            self._openai_client = OpenAI(
                api_key=self.settings.require_openai_api_key(),
                timeout=self.settings.openai_timeout_seconds,
                max_retries=min(
                    max(self.settings.openai_max_retries, 0),
                    1,
                ),
            )
        return self._openai_client

    def _get_collection(self) -> Any:
        if self._collection is None:
            self._collection = get_vector_collection(
                self.settings,
                client=self._chroma_client,
            )
        return self._collection

    def _embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        try:
            response = self._get_openai_client().embeddings.create(
                model=self.settings.openai_embedding_model,
                input=list(texts),
            )
        except ConfigurationError:
            raise
        except Exception as exc:
            raise RAGServiceError(
                "OpenAI 임베딩 생성에 실패했습니다. 잠시 후 다시 시도하세요."
            ) from exc

        ordered_data = sorted(
            response.data,
            key=lambda item: getattr(item, "index", 0),
        )
        embeddings = [list(item.embedding) for item in ordered_data]
        if len(embeddings) != len(texts):
            raise RAGServiceError(
                "OpenAI 임베딩 응답 개수가 요청 문서 수와 일치하지 않습니다."
            )
        return embeddings

    def index_knowledge_base(
        self,
        *,
        path: Path | None = None,
        strict_provenance: bool = False,
    ) -> IndexingResult:
        report: KnowledgeBaseReport = load_knowledge_base(
            path or self.settings.knowledge_base_path,
            strict_provenance=strict_provenance,
        )
        index_limit = min(
            self.settings.rag_max_index_documents,
            MAX_INDEX_DOCUMENTS,
        )
        if len(report.documents) > index_limit:
            raise RAGServiceError(
                "API 과사용 방지를 위해 한 번에 임베딩할 수 있는 문서 수를 "
                f"{index_limit}개로 제한했습니다."
            )
        embeddings = self._embed([document.text for document in report.documents])
        collection = self._get_collection()
        try:
            collection.upsert(
                ids=[document.document_id for document in report.documents],
                documents=[document.text for document in report.documents],
                metadatas=[
                    document.to_metadata() for document in report.documents
                ],
                embeddings=embeddings,
            )
        except Exception as exc:
            raise RAGServiceError(
                "ChromaDB 지식 문서 저장에 실패했습니다."
            ) from exc

        return IndexingResult(
            indexed_count=len(report.documents),
            collection_name=self.settings.chroma_collection_name,
            warnings=report.warnings,
        )

    def retrieve(
        self,
        question: str,
        *,
        top_k: int | None = None,
    ) -> list[RetrievedDocument]:
        if not isinstance(question, str):
            raise ValueError("질문은 문자열이어야 합니다.")
        normalized_question = question.strip()
        if not normalized_question:
            raise ValueError("질문을 입력해 주세요.")
        if len(normalized_question) > 2000:
            raise ValueError("질문은 2,000자 이하로 입력해 주세요.")

        collection = self._get_collection()
        try:
            document_count = collection.count()
        except Exception as exc:
            raise RAGServiceError("ChromaDB 상태 확인에 실패했습니다.") from exc
        if document_count == 0:
            raise KnowledgeBaseNotIndexedError(
                "지식베이스가 비어 있습니다. "
                "먼저 scripts/index_tax_faq.py를 실행하세요."
            )

        requested_top_k = self.settings.rag_top_k if top_k is None else top_k
        if (
            not isinstance(requested_top_k, int)
            or isinstance(requested_top_k, bool)
            or requested_top_k <= 0
            or requested_top_k > MAX_RETRIEVAL_DOCUMENTS
        ):
            raise ValueError(
                f"top_k는 1 이상 {MAX_RETRIEVAL_DOCUMENTS} 이하이어야 합니다."
            )
        candidate_count = min(
            max(self.settings.rag_candidate_k, requested_top_k),
            document_count,
        )

        query_embedding = self._embed([normalized_question])[0]
        try:
            ranked_candidates = hybrid_search(
                collection,
                query=normalized_question,
                query_embedding=query_embedding,
                candidate_k=candidate_count,
                top_k=requested_top_k,
                min_relevance_score=self.settings.rag_min_relevance_score,
            )
        except HybridSearchError as exc:
            raise RAGServiceError("ChromaDB 문서 검색에 실패했습니다.") from exc

        retrieved: list[RetrievedDocument] = []
        for candidate in ranked_candidates:
            document = candidate.document
            metadata = document.metadata
            retrieved.append(
                RetrievedDocument(
                    document_id=document.document_id,
                    text=document.text,
                    title=str(metadata.get("title") or document.document_id),
                    category=str(metadata.get("category") or "미분류"),
                    source_title=str(metadata.get("source_title") or ""),
                    source_url=str(metadata.get("source_url") or ""),
                    effective_date=str(metadata.get("effective_date") or ""),
                    last_verified=str(metadata.get("last_verified") or ""),
                    source_chunk_ids=str(
                        metadata.get("source_chunk_ids") or ""
                    ),
                    provenance_verified=bool(
                        metadata.get("provenance_verified", False)
                    ),
                    relevance_score=candidate.relevance_score,
                )
            )
        return retrieved

    def answer_question_stream(self, question: str, chat_history: list[dict[str, Any]] | None = None):
        import json
        retrieved = self.retrieve(question)
        if not retrieved:
            yield f"event: sources\ndata: []\n\n"
            yield f"event: message\ndata: {json.dumps({'content': NO_RELEVANT_CONTEXT_MESSAGE}, ensure_ascii=False)}\n\n"
            return

        context = self._build_context(retrieved)
        
        history_text = ""
        if chat_history:
            history_lines = []
            for msg in chat_history:
                role_val = msg.get("role") if isinstance(msg, dict) else getattr(msg, "role", "")
                msg_val = msg.get("message") if isinstance(msg, dict) else getattr(msg, "message", "")
                role_label = "사용자" if role_val == "user" else "AI"
                history_lines.append(f"[{role_label}]: {msg_val}")
            history_text = "\n최근 대화 기록:\n" + "\n".join(history_lines) + "\n\n"

        user_prompt = (
            f"사용자 질문:\n{question.strip()}\n\n"
            f"{history_text}"
            f"검색된 근거 문서:\n{context}\n\n"
            "위 근거만 사용해 한국어로 답하세요. (이전 대화 맥락이 있다면 이를 참고해 자연스럽게 답변하세요)"
        )
        
        sources = [document.to_source() for document in retrieved]
        # yield sources first
        sources_dict = []
        for s in sources:
            sources_dict.append({
                "document_id": s.document_id,
                "title": s.title,
                "category": s.category,
                "source_title": s.source_title,
                "source_url": s.source_url,
                "effective_date": s.effective_date,
                "last_verified": s.last_verified,
                "source_chunk_ids": s.source_chunk_ids,
                "excerpt": s.excerpt,
                "provenance_verified": s.provenance_verified,
            })
        yield f"event: sources\ndata: {json.dumps(sources_dict, ensure_ascii=False)}\n\n"

        full_answer = ""
        try:
            client = self._get_openai_client()
            # Use standard chat completions API for streaming
            response_stream = client.chat.completions.create(
                model=self.settings.openai_chat_model,
                messages=[
                    {"role": "system", "content": RAG_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                stream=True
            )
            
            for chunk in response_stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_answer += content
                    yield f"event: message\ndata: {json.dumps({'content': content}, ensure_ascii=False)}\n\n"
            
            # Quick replies generation
            qr_prompt = (
                "다음 사용자의 질문과 AI의 답변을 바탕으로, 사용자가 이어서 물어볼 법한 연관 질문 3가지를 생성해 주세요.\n"
                "반드시 3개의 문자열을 담은 JSON 배열 형태로만 출력하세요.\n\n"
                f"[질문]: {question}\n[답변]: {full_answer}"
            )
            qr_response = client.chat.completions.create(
                model=self.settings.openai_chat_model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that only outputs a JSON array of strings."},
                    {"role": "user", "content": qr_prompt}
                ]
            )
            qr_text = qr_response.choices[0].message.content.strip()
            if qr_text.startswith("```json"):
                qr_text = qr_text[7:]
            if qr_text.endswith("```"):
                qr_text = qr_text[:-3]
            qr_text = qr_text.strip()
            
            # Validate JSON
            try:
                qr_json = json.loads(qr_text)
                yield f"event: quick_replies\ndata: {json.dumps(qr_json, ensure_ascii=False)}\n\n"
            except:
                yield f"event: quick_replies\ndata: []\n\n"
                
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"

    def answer_question(self, question: str, chat_history: Sequence[dict[str, Any]] | None = None) -> RAGAnswer:
        retrieved = self.retrieve(question)
        return self.answer_from_retrieved_documents(
            question,
            retrieved,
            chat_history=chat_history,
        )

    def answer_from_retrieved_documents(
        self,
        question: str,
        retrieved: Sequence[RetrievedDocument],
        *,
        chat_history: Sequence[dict[str, Any]] | None = None,
    ) -> RAGAnswer:
        """Generate an answer from already retrieved evidence without retrieving again."""
        if not retrieved:
            return RAGAnswer(
                answer=NO_RELEVANT_CONTEXT_MESSAGE,
                grounded=False,
                needs_source_verification=True,
                sources=[],
                model=None,
                disclaimer=RAG_DISCLAIMER,
            )

        context = self._build_context(retrieved)
        
        history_text = ""
        if chat_history:
            history_lines = []
            for msg in chat_history:
                role_val = msg.get("role") if isinstance(msg, dict) else getattr(msg, "role", "")
                msg_val = msg.get("message") if isinstance(msg, dict) else getattr(msg, "message", "")
                role_label = "사용자" if role_val == "user" else "AI"
                history_lines.append(f"[{role_label}]: {msg_val}")
            history_text = "\n최근 대화 기록:\n" + "\n".join(history_lines) + "\n\n"

        user_prompt = (
            f"사용자 질문:\n{question.strip()}\n\n"
            f"{history_text}"
            f"검색된 근거 문서:\n{context}\n\n"
            "위 근거만 사용해 한국어로 답하세요. (이전 대화 맥락이 있다면 이를 참고해 자연스럽게 답변하세요)"
        )
        try:
            response = self._get_openai_client().responses.create(
                model=self.settings.openai_chat_model,
                instructions=RAG_SYSTEM_PROMPT,
                input=user_prompt,
            )
        except Exception as exc:
            raise RAGServiceError(
                "OpenAI 답변 생성에 실패했습니다. 잠시 후 다시 시도하세요."
            ) from exc

        answer = str(getattr(response, "output_text", "")).strip()
        if not answer:
            raise RAGServiceError("OpenAI가 비어 있는 답변을 반환했습니다.")

        sources = [document.to_source() for document in retrieved]
        return RAGAnswer(
            answer=answer,
            grounded=True,
            needs_source_verification=any(
                not source.provenance_verified for source in sources
            ),
            sources=sources,
            model=self.settings.openai_chat_model,
            disclaimer=RAG_DISCLAIMER,
        )

    @staticmethod
    def _build_context(documents: Sequence[RetrievedDocument]) -> str:
        blocks: list[str] = []
        for index, document in enumerate(documents, start=1):
            source = document.source_title or "출처 메타데이터 미등록"
            effective_date = document.effective_date or "기준일 미등록"
            source_chunks = document.source_chunk_ids or "근거 청크 미등록"
            blocks.append(
                "\n".join(
                    (
                        f"[문서 {index}]",
                        f"문서 ID: {document.document_id}",
                        f"분류: {document.category}",
                        f"출처: {source}",
                        f"기준일: {effective_date}",
                        f"근거 청크: {source_chunks}",
                        f"내용: {document.text}",
                    )
                )
            )
        return "\n\n".join(blocks)


def answer_question(question: str) -> RAGAnswer:
    """기본 환경변수 설정으로 질문을 검색하고 근거 기반 답변을 생성한다."""

    return RAGService().answer_question(question)
