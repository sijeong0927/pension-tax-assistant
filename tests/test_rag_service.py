from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.core.config import ConfigurationError, RAGSettings
from app.core.prompts import RAG_SYSTEM_PROMPT
from app.services.chat_calculation_guard import CALCULATION_HANDOFF_MESSAGE
from app.services.knowledge_base import load_knowledge_base
from app.services.rag_service import RAGService, RAGServiceError


class FakeEmbeddings:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        data = [
            SimpleNamespace(index=index, embedding=[1.0, 0.0, float(index)])
            for index, _ in enumerate(kwargs["input"])
        ]
        return SimpleNamespace(data=data)


class FakeResponses:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(
            output_text="연금계좌 세액공제 한도를 확인하세요. [문서 1]"
        )


class FakeChatCompletions:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.response_intent = "회사제출용"

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        messages = kwargs.get("messages", [])
        user_msg = ""
        for m in messages:
            if isinstance(m, dict) and m.get("role") == "user":
                user_msg = m.get("content", "")
        
        # Extract the actual query part to avoid matching system template instructions
        actual_query = user_msg
        if "[질문]:" in user_msg:
            parts = user_msg.split("[질문]:")
            if len(parts) > 1:
                actual_query = parts[1].split("반드시 JSON")[0]
            
        intent = self.response_intent
        # Simple dynamic mocking based on keywords in actual query
        if "세무서" in actual_query or "국세청" in actual_query or "방문" in actual_query or "사업자등록" in actual_query:
            intent = "관할세무서"
            
        content = json.dumps({"intent": intent})
        message = SimpleNamespace(content=content)
        choice = SimpleNamespace(message=message)
        return SimpleNamespace(choices=[choice])


class FakeOpenAI:
    def __init__(self) -> None:
        self.embeddings = FakeEmbeddings()
        self.responses = FakeResponses()
        self.chat = SimpleNamespace(completions=FakeChatCompletions())


class FakeCollection:
    def __init__(self, *, distance: float = 0.1) -> None:
        self.distance = distance
        self.upsert_payload: dict[str, Any] | None = None
        self.last_query_where: dict[str, Any] | None = None
        self.last_get_where: dict[str, Any] | None = None

    def count(self) -> int:
        return 1

    def query(self, **kwargs: Any) -> dict[str, Any]:
        self.last_query_where = kwargs.get("where")
        return {
            "ids": [["faq_01"]],
            "documents": [["질문: 납입 한도는?\n답변: 합산 900만 원입니다."]],
            "metadatas": [
                [
                    {
                        "title": "납입 한도는?",
                        "category": "납입 및 공제한도",
                        "source_title": "국세청 안내",
                        "source_url": "https://example.test/official",
                        "effective_date": "2026-01-01",
                        "last_verified": "2026-08-04",
                        "source_chunk_ids": "faq_01",
                        "provenance_verified": True,
                        "target": "회사제출용",
                    }
                ]
            ],
            "distances": [[self.distance]],
        }

    def get(self, **kwargs: Any) -> dict[str, Any]:
        self.last_get_where = kwargs.get("where")
        result = self.query(**kwargs)
        return {
            "ids": result["ids"][0],
            "documents": result["documents"][0],
            "metadatas": result["metadatas"][0],
        }

    def upsert(self, **kwargs: Any) -> None:
        self.upsert_payload = kwargs


def make_settings(tmp_path: Path) -> RAGSettings:
    return RAGSettings(
        openai_api_key="test-key",
        openai_chat_model="gpt-4o-mini",
        openai_embedding_model="text-embedding-3-small",
        openai_timeout_seconds=30,
        openai_max_retries=1,
        chroma_persist_dir=tmp_path / ".chroma",
        chroma_collection_name="test_collection",
        knowledge_base_path=Path("app/data/tax_faq.json"),
        rag_top_k=4,
        rag_candidate_k=12,
        rag_min_relevance_score=0.35,
        rag_max_index_documents=100,
        rag_max_pdf_documents=1000,
        rag_max_pdf_embedding_requests=50,
    )


def test_answer_question_returns_sources(tmp_path: Path) -> None:
    openai_client = FakeOpenAI()
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=openai_client,
        collection=FakeCollection(),
    )

    answer = service.answer_question("연금저축과 IRP 한도는?")

    assert answer.grounded is True
    assert answer.needs_source_verification is False
    assert answer.sources[0].document_id == "faq_01"
    assert answer.sources[0].relevance_score == 0.9
    assert openai_client.responses.calls[0]["model"] == "gpt-4o-mini"
    assert "[문서 1]" in openai_client.responses.calls[0]["input"]


class FailingCollection:
    def count(self) -> int:
        raise AssertionError("Calculation requests must not reach retrieval.")


@pytest.mark.parametrize(
    "question",
    [
        "카드 2,000만원 쓰면 소득공제를 얼마 받을 수 있나요?",
        "내 총급여를 모르는데 카드 사용액 2,000만원의 25% 기준을 계산해 주세요.",
        "연봉 6,000만원이고 연금저축에 500만원 넣었는데 환급액을 계산해 줘.",
        "제 한도 채웠나요?",
        "제 월급과 기존 납입액을 기준으로 올해 더 넣는 게 좋은지 추천해 줄 수 있나요?",
    ],
)
def test_personal_calculation_questions_return_handoff_without_rag(
    tmp_path: Path,
    question: str,
) -> None:
    openai_client = FakeOpenAI()
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=openai_client,
        collection=FailingCollection(),
    )

    answer = service.answer_question(question)

    assert answer.answer == CALCULATION_HANDOFF_MESSAGE
    assert answer.sources == []
    assert answer.model is None
    assert openai_client.embeddings.calls == []
    assert openai_client.responses.calls == []


def test_calculation_handoff_stream_does_not_reach_rag(tmp_path: Path) -> None:
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=FakeOpenAI(),
        collection=FailingCollection(),
    )

    events = list(service.answer_question_stream("카드 2,000만원 쓰면 얼마 공제받아?"))

    assert events == [
        "event: sources\ndata: []\n\n",
        'event: message\ndata: {"content": "' + CALCULATION_HANDOFF_MESSAGE + '"}\n\n',
    ]


@pytest.mark.parametrize(
    "question",
    [
        "연금계좌 세액공제 한도는 얼마인가요?",
        "연금저축 세액공제 한도는 얼마나 되나요?",
        "IRP는 얼마나 오래 유지해야 하나요?",
        "중도인출하면 세금이 얼마나 부과되나요?",
    ],
)
def test_general_policy_question_is_not_treated_as_personal_calculation(
    tmp_path: Path,
    question: str,
) -> None:
    openai_client = FakeOpenAI()
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=openai_client,
        collection=FakeCollection(),
    )

    answer = service.answer_question(question)

    assert answer.grounded is True
    assert len(openai_client.responses.calls) == 1


def test_calculation_guard_keeps_existing_non_string_validation(tmp_path: Path) -> None:
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=FakeOpenAI(),
        collection=FakeCollection(),
    )

    with pytest.raises(ValueError, match="문자열"):
        service.answer_question(123)  # type: ignore[arg-type]


def test_streamed_sources_include_excerpt_and_hide_relevance_score(
    tmp_path: Path,
) -> None:
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=FakeOpenAI(),
        collection=FakeCollection(),
    )

    first_event = next(service.answer_question_stream("연금저축 한도는?"))
    payload = json.loads(first_event.split("data: ", 1)[1].strip())

    assert payload[0]["source_chunk_ids"] == ["faq_01"]
    assert payload[0]["excerpt"] == "질문: 납입 한도는? 답변: 합산 900만 원입니다."
    assert "relevance_score" not in payload[0]


def test_answer_question_keeps_chat_history_in_generation_prompt(
    tmp_path: Path,
) -> None:
    openai_client = FakeOpenAI()
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=openai_client,
        collection=FakeCollection(),
    )
    history = [SimpleNamespace(role="user", message="이전 질문")]

    service.answer_question(
        "현재 질문",
        chat_history=history,  # type: ignore[arg-type]
    )

    prompt = openai_client.responses.calls[0]["input"]
    assert "최근 대화 기록" in prompt
    assert "이전 질문" in prompt


def test_system_prompt_blocks_unsupported_numeric_transformations() -> None:
    assert "숫자를 임의로 보간·환산·계산하지 마세요" in RAG_SYSTEM_PROMPT
    assert "문서 간 수치가 다르면" in RAG_SYSTEM_PROMPT
    assert "계산 기준이나 단위를 확정할 수 없으면" in RAG_SYSTEM_PROMPT
    assert "개인별 납입 가능액" in RAG_SYSTEM_PROMPT
    assert "앱의 진단 기능" in RAG_SYSTEM_PROMPT
    assert "한 가지 의미로 단정하지 말고" in RAG_SYSTEM_PROMPT


def test_low_relevance_skips_answer_generation(tmp_path: Path) -> None:
    openai_client = FakeOpenAI()
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=openai_client,
        collection=FakeCollection(distance=0.9),
    )

    answer = service.answer_question("오늘 날씨는?")

    assert answer.grounded is False
    assert answer.sources == []
    assert answer.model is None
    assert openai_client.responses.calls == []


@pytest.mark.parametrize("top_k", [0, -1, 9])
def test_out_of_range_top_k_is_rejected(
    tmp_path: Path,
    top_k: int,
) -> None:
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=FakeOpenAI(),
        collection=FakeCollection(),
    )

    with pytest.raises(ValueError, match="top_k"):
        service.retrieve("연금계좌 세액공제 한도는?", top_k=top_k)


def test_index_knowledge_base_upserts_all_documents(tmp_path: Path) -> None:
    openai_client = FakeOpenAI()
    collection = FakeCollection()
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=openai_client,
        collection=collection,
    )

    result = service.index_knowledge_base()

    assert result.indexed_count == 61
    assert collection.upsert_payload is not None
    assert len(collection.upsert_payload["ids"]) == 61
    assert len(collection.upsert_payload["embeddings"]) == 61


def test_new_faq_query_keeps_corrected_public_pension_context(tmp_path: Path) -> None:
    report = load_knowledge_base(
        Path(__file__).resolve().parents[1] / "app/data/tax_faq.json"
    )
    document = next(
        item for item in report.documents if item.document_id == "faq_23"
    )

    class FaqCollection(FakeCollection):
        def query(self, **_: Any) -> dict[str, Any]:
            return {
                "ids": [[document.document_id]],
                "documents": [[document.text]],
                "metadatas": [[document.to_metadata()]],
                "distances": [[0.1]],
            }

    openai_client = FakeOpenAI()
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=openai_client,
        collection=FaqCollection(),
    )

    answer = service.answer_question("공적연금과 사적연금은 함께 과세되나요?")

    assert answer.grounded is True
    assert answer.sources[0].document_id == "faq_23"
    assert answer.sources[0].provenance_verified is True
    assert "과세대상 공적연금소득" in openai_client.responses.calls[0]["input"]


def test_general_faq_returns_preindexed_pdf_chunk_ids(tmp_path: Path) -> None:
    report = load_knowledge_base(
        Path(__file__).resolve().parents[1] / "app/data/tax_faq.json"
    )
    document = next(
        item for item in report.documents if item.document_id == "faq_41"
    )

    class FaqCollection(FakeCollection):
        def query(self, **_: Any) -> dict[str, Any]:
            return {
                "ids": [[document.document_id]],
                "documents": [[document.text]],
                "metadatas": [[document.to_metadata()]],
                "distances": [[0.1]],
            }

    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=FakeOpenAI(),
        collection=FaqCollection(),
    )

    answer = service.answer_question("연도 중 퇴사하면 언제 정산하나요?")

    assert answer.sources[0].source_chunk_ids == [
        "pdf_page_103_chunk_00",
        "pdf_page_103_chunk_01",
        "pdf_page_106_chunk_00",
    ]


def test_index_document_limit_prevents_openai_call(tmp_path: Path) -> None:
    openai_client = FakeOpenAI()
    settings = replace(make_settings(tmp_path), rag_max_index_documents=20)
    service = RAGService(
        settings=settings,
        openai_client=openai_client,
        collection=FakeCollection(),
    )

    with pytest.raises(RAGServiceError, match="API 과사용 방지"):
        service.index_knowledge_base()

    assert openai_client.embeddings.calls == []


def test_chroma_round_trip_with_fake_openai(tmp_path: Path) -> None:
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=FakeOpenAI(),
    )

    indexing_result = service.index_knowledge_base()
    retrieved = service.retrieve("연금계좌 세액공제 가이드")

    assert indexing_result.indexed_count == 61
    assert retrieved
    assert retrieved[0].document_id == "guide_00"
    assert (tmp_path / ".chroma").exists()


def test_missing_openai_api_key_has_actionable_error(tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    settings_without_key = replace(settings, openai_api_key=None)
    service = RAGService(
        settings=settings_without_key,
        collection=FakeCollection(),
    )

    with pytest.raises(ConfigurationError, match="OPENAI_API_KEY"):
        service.retrieve("연금계좌 세액공제 한도는?")


def test_query_router_rules() -> None:
    from app.services.query_router import is_obvious_tax_office_visit
    
    assert is_obvious_tax_office_visit("세무서 갈 때 신분증만 가져가면 되나요?") is True
    assert is_obvious_tax_office_visit("국세청 방문 서류가 뭐야?") is True
    assert is_obvious_tax_office_visit("연금저축 한도는 어떻게 되나요?") is False


def test_query_router_llm_fallback() -> None:
    from app.services.query_router import route_query
    
    openai_client = FakeOpenAI()
    openai_client.chat.completions.response_intent = "회사제출용"
    
    # 룰 매칭이 되지 않는 다소 모호한 문장 -> LLM 판별
    intent = route_query("연말정산 낼 서류 알려주라", openai_client, "gpt-4o-mini")
    assert intent == "회사제출용"
    
    openai_client.chat.completions.response_intent = "관할세무서"
    intent = route_query("사업자등록하러 가려고 해", openai_client, "gpt-4o-mini")
    assert intent == "관할세무서"


def test_rag_service_tax_office_visit_uses_filter(tmp_path: Path) -> None:
    openai_client = FakeOpenAI()
    collection = FakeCollection()
    service = RAGService(
        settings=make_settings(tmp_path),
        openai_client=openai_client,
        collection=collection,
    )
    
    # "국세청 방문할 때 필요한 서류"는 룰 매칭으로 인해 "관할세무서"로 분류됨
    service.retrieve("국세청 방문할 때 필요한 서류가 뭐야?")
    
    assert collection.last_query_where == {"target": "관할세무서"}
    assert collection.last_get_where == {"target": "관할세무서"}
