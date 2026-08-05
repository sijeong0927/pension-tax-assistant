from __future__ import annotations

import json
import math
import re
import unicodedata
import urllib.error
import urllib.request
from collections import Counter
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Protocol, Sequence


RRF_RANK_CONSTANT = 60
BM25_K1 = 1.5
BM25_B = 0.75
COHERE_RERANK_URL = "https://api.cohere.com/v2/rerank"

_LEGAL_REFERENCE_PATTERN = re.compile(
    r"제\s*(\d+)\s*조(?:\s*의\s*(\d+))?",
)
_AMOUNT_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?)\s*(만|천|백)?\s*원",
)
_PERCENT_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_HUNDREDTHS_PATTERN = re.compile(r"100\s*분의\s*(\d+(?:\.\d+)?)")
_TOKEN_PATTERN = re.compile(
    r"제\d+조(?:의\d+)?"
    r"|\d+(?:\.\d+)?(?:만원|천원|백원|원|%)?"
    r"|[a-z]+"
    r"|[가-힣]+",
)
_PROTECTED_TOKEN_PATTERN = re.compile(
    r"(?:제\d+조(?:의\d+)?|\d+(?:\.\d+)?(?:만원|천원|백원|원|%)?)"
)
_LEGAL_TOKEN_PATTERN = re.compile(r"제\d+조(?:의\d+)?")


class HybridSearchError(RuntimeError):
    """하이브리드 검색이 후보 문서를 구성하지 못했을 때 발생하는 예외."""


class RerankerError(RuntimeError):
    """외부 리랭킹 서비스의 요청 또는 응답이 유효하지 않을 때 발생하는 예외."""


@dataclass(frozen=True)
class SearchDocument:
    document_id: str
    text: str
    metadata: Mapping[str, Any]


@dataclass(frozen=True)
class RankedCandidate:
    document: SearchDocument
    vector_score: float
    lexical_score: float
    fusion_score: float
    legal_token_coverage: float
    relevance_score: float
    ordering_score: float


@dataclass(frozen=True)
class RerankResult:
    index: int
    relevance_score: float


class Reranker(Protocol):
    def rerank(
        self,
        query: str,
        documents: Sequence[str],
        *,
        top_n: int,
    ) -> Sequence[RerankResult]:
        """질문과 문서의 관련성을 평가해 높은 순서로 반환한다."""


JSONTransport = Callable[
    [str, Mapping[str, str], Mapping[str, Any], float],
    Mapping[str, Any],
]


def tokenize_for_bm25(text: str) -> tuple[str, ...]:
    """한글 단어와 조문·금액·비율 토큰을 손실 없이 정규화한다."""
    normalized = unicodedata.normalize("NFKC", text).lower()
    normalized = _LEGAL_REFERENCE_PATTERN.sub(
        lambda match: (
            f"제{match.group(1)}조"
            + (f"의{match.group(2)}" if match.group(2) else "")
        ),
        normalized,
    )
    normalized = re.sub(r"(?<=\d),(?=\d)", "", normalized)
    normalized = _AMOUNT_PATTERN.sub(
        lambda match: f"{match.group(1)}{match.group(2) or ''}원",
        normalized,
    )
    normalized = _HUNDREDTHS_PATTERN.sub(r"\1%", normalized)
    normalized = _PERCENT_PATTERN.sub(r"\1%", normalized)
    tokens: list[str] = []
    for token in _TOKEN_PATTERN.findall(normalized):
        if re.fullmatch(r"[가-힣]+", token):
            if len(token) == 1:
                continue
            tokens.append(token)
            tokens.extend(
                token[index : index + 2]
                for index in range(len(token) - 1)
                if len(token) > 2
            )
        else:
            tokens.append(token)
    return tuple(tokens)


def _protected_token_coverage(
    query_tokens: Sequence[str],
    document_tokens: Sequence[str],
) -> float:
    protected = {
        token for token in query_tokens if _PROTECTED_TOKEN_PATTERN.fullmatch(token)
    }
    if not protected:
        return 0.0
    document_token_set = set(document_tokens)
    return len(protected.intersection(document_token_set)) / len(protected)


def _legal_token_coverage(
    query_tokens: Sequence[str],
    document_tokens: Sequence[str],
) -> float:
    legal_tokens = {
        token for token in query_tokens if _LEGAL_TOKEN_PATTERN.fullmatch(token)
    }
    if not legal_tokens:
        return 0.0
    return len(legal_tokens.intersection(document_tokens)) / len(legal_tokens)


def _bm25_rank(
    query: str,
    documents: Sequence[SearchDocument],
    *,
    limit: int,
) -> list[tuple[SearchDocument, float, float, float]]:
    query_tokens = tokenize_for_bm25(query)
    if not query_tokens or not documents or limit <= 0:
        return []

    tokenized_documents = [
        tokenize_for_bm25(document.text) for document in documents
    ]
    average_length = (
        sum(len(tokens) for tokens in tokenized_documents)
        / len(tokenized_documents)
    )
    if average_length == 0:
        return []

    document_frequency: Counter[str] = Counter()
    for tokens in tokenized_documents:
        document_frequency.update(set(tokens))

    query_token_set = set(query_tokens)
    ranked: list[tuple[SearchDocument, float, float, float]] = []
    document_count = len(documents)
    for document, tokens in zip(documents, tokenized_documents):
        if not tokens:
            continue
        frequencies = Counter(tokens)
        score = 0.0
        for token in query_token_set:
            frequency = frequencies.get(token, 0)
            if frequency == 0:
                continue
            frequency_in_documents = document_frequency[token]
            inverse_document_frequency = math.log(
                1
                + (
                    document_count
                    - frequency_in_documents
                    + 0.5
                )
                / (frequency_in_documents + 0.5)
            )
            length_normalization = BM25_K1 * (
                1
                - BM25_B
                + BM25_B * len(tokens) / average_length
            )
            score += inverse_document_frequency * (
                frequency * (BM25_K1 + 1)
                / (frequency + length_normalization)
            )

        if score <= 0:
            continue
        token_set = set(tokens)
        query_coverage = len(query_token_set.intersection(token_set)) / len(
            query_token_set
        )
        protected_coverage = _protected_token_coverage(query_tokens, tokens)
        legal_coverage = _legal_token_coverage(query_tokens, tokens)
        saturation = score / (score + 1)
        lexical_relevance = min(
            1.0,
            query_coverage * 0.65
            + protected_coverage * 0.2
            + saturation * 0.15,
        )
        ranked.append(
            (
                document,
                score,
                lexical_relevance,
                legal_coverage,
            )
        )

    ranked.sort(
        key=lambda item: (
            item[3],
            item[1],
            item[0].document_id,
        ),
        reverse=True,
    )
    return ranked[:limit]


def _documents_from_get_result(result: Mapping[str, Any]) -> list[SearchDocument]:
    raw_ids = result.get("ids") or []
    raw_documents = result.get("documents") or []
    raw_metadatas = result.get("metadatas") or []
    if not (
        isinstance(raw_ids, Sequence)
        and isinstance(raw_documents, Sequence)
        and isinstance(raw_metadatas, Sequence)
    ):
        raise HybridSearchError("ChromaDB 문서 목록 응답 형식이 올바르지 않습니다.")
    if not len(raw_ids) == len(raw_documents) == len(raw_metadatas):
        raise HybridSearchError("ChromaDB 문서 목록 응답 개수가 일치하지 않습니다.")
    return [
        SearchDocument(
            document_id=str(document_id),
            text=str(text or ""),
            metadata=dict(metadata or {}),
        )
        for document_id, text, metadata in zip(
            raw_ids,
            raw_documents,
            raw_metadatas,
        )
    ]


def _vector_rank(
    result: Mapping[str, Any],
) -> list[tuple[SearchDocument, float]]:
    ids = (result.get("ids") or [[]])[0]
    documents = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]
    if not len(ids) == len(documents) == len(metadatas) == len(distances):
        raise HybridSearchError("ChromaDB 벡터 검색 응답 개수가 일치하지 않습니다.")

    return [
        (
            SearchDocument(
                document_id=str(document_id),
                text=str(text or ""),
                metadata=dict(metadata or {}),
            ),
            max(0.0, min(1.0, 1.0 - float(distance))),
        )
        for document_id, text, metadata, distance in zip(
            ids,
            documents,
            metadatas,
            distances,
        )
    ]


def _fuse_candidates(
    vector_ranked: Sequence[tuple[SearchDocument, float]],
    lexical_ranked: Sequence[tuple[SearchDocument, float, float, float]],
) -> list[RankedCandidate]:
    documents: dict[str, SearchDocument] = {}
    vector_scores: dict[str, float] = {}
    lexical_scores: dict[str, float] = {}
    legal_coverages: dict[str, float] = {}
    reciprocal_scores: Counter[str] = Counter()

    for rank, (document, vector_score) in enumerate(vector_ranked, start=1):
        documents[document.document_id] = document
        vector_scores[document.document_id] = vector_score
        reciprocal_scores[document.document_id] += 1 / (
            RRF_RANK_CONSTANT + rank
        )

    for rank, (
        document,
        _raw_score,
        lexical_score,
        legal_coverage,
    ) in enumerate(lexical_ranked, start=1):
        documents.setdefault(document.document_id, document)
        lexical_scores[document.document_id] = lexical_score
        legal_coverages[document.document_id] = legal_coverage
        reciprocal_scores[document.document_id] += 1 / (
            RRF_RANK_CONSTANT + rank
        )

    maximum_rrf_score = 2 / (RRF_RANK_CONSTANT + 1)
    candidates: list[RankedCandidate] = []
    for document_id, document in documents.items():
        vector_score = vector_scores.get(document_id, 0.0)
        lexical_score = lexical_scores.get(document_id, 0.0)
        legal_coverage = legal_coverages.get(document_id, 0.0)
        fusion_score = min(
            1.0,
            reciprocal_scores[document_id] / maximum_rrf_score,
        )
        relevance_score = max(vector_score, lexical_score)
        ordering_score = min(
            1.0,
            fusion_score * 0.45
            + vector_score * 0.3
            + lexical_score * 0.1
            + legal_coverage * 0.2,
        )
        candidates.append(
            RankedCandidate(
                document=document,
                vector_score=vector_score,
                lexical_score=lexical_score,
                fusion_score=fusion_score,
                legal_token_coverage=legal_coverage,
                relevance_score=relevance_score,
                ordering_score=ordering_score,
            )
        )

    candidates.sort(
        key=lambda candidate: (
            candidate.ordering_score,
            candidate.relevance_score,
            candidate.document.document_id,
        ),
        reverse=True,
    )
    return candidates


def _post_json(
    url: str,
    headers: Mapping[str, str],
    payload: Mapping[str, Any],
    timeout_seconds: float,
) -> Mapping[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=dict(headers),
        method="POST",
    )
    try:
        with urllib.request.urlopen(
            request,
            timeout=timeout_seconds,
        ) as response:
            body = response.read().decode("utf-8")
    except (OSError, urllib.error.HTTPError, urllib.error.URLError) as exc:
        raise RerankerError("Cohere 리랭킹 요청에 실패했습니다.") from exc
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RerankerError("Cohere 리랭킹 응답이 JSON 형식이 아닙니다.") from exc
    if not isinstance(parsed, Mapping):
        raise RerankerError("Cohere 리랭킹 응답 형식이 올바르지 않습니다.")
    return parsed


class CohereReranker:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_seconds: float,
        transport: JSONTransport = _post_json,
    ) -> None:
        if not api_key:
            raise ValueError("Cohere API 키가 필요합니다.")
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self._transport = transport

    def rerank(
        self,
        query: str,
        documents: Sequence[str],
        *,
        top_n: int,
    ) -> Sequence[RerankResult]:
        if not documents or top_n <= 0:
            return []
        try:
            response = self._transport(
                COHERE_RERANK_URL,
                {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                {
                    "model": self.model,
                    "query": query,
                    "documents": list(documents),
                    "top_n": min(top_n, len(documents)),
                },
                self.timeout_seconds,
            )
        except RerankerError:
            raise
        except Exception as exc:
            raise RerankerError("Cohere 리랭킹 요청에 실패했습니다.") from exc

        raw_results = response.get("results")
        if not isinstance(raw_results, list):
            raise RerankerError("Cohere 리랭킹 결과가 누락되었습니다.")

        results: list[RerankResult] = []
        seen_indices: set[int] = set()
        for raw_result in raw_results:
            if not isinstance(raw_result, Mapping):
                raise RerankerError("Cohere 리랭킹 결과 형식이 올바르지 않습니다.")
            raw_index = raw_result.get("index")
            raw_score = raw_result.get("relevance_score")
            if (
                not isinstance(raw_index, int)
                or isinstance(raw_index, bool)
                or raw_index < 0
                or raw_index >= len(documents)
                or raw_index in seen_indices
            ):
                raise RerankerError("Cohere 리랭킹 문서 인덱스가 올바르지 않습니다.")
            try:
                score = float(raw_score)
            except (TypeError, ValueError) as exc:
                raise RerankerError(
                    "Cohere 리랭킹 관련성 점수가 올바르지 않습니다."
                ) from exc
            if not 0 <= score <= 1:
                raise RerankerError(
                    "Cohere 리랭킹 관련성 점수 범위가 올바르지 않습니다."
                )
            seen_indices.add(raw_index)
            results.append(
                RerankResult(
                    index=raw_index,
                    relevance_score=score,
                )
            )
        return results


def hybrid_search(
    collection: Any,
    *,
    query: str,
    query_embedding: Sequence[float],
    candidate_k: int,
    top_k: int,
    min_relevance_score: float,
    reranker: Reranker | None = None,
) -> list[RankedCandidate]:
    """벡터·BM25 후보를 결합하고 선택적으로 외부 리랭킹을 적용한다."""
    try:
        vector_result = collection.query(
            query_embeddings=[list(query_embedding)],
            n_results=candidate_k,
            include=["documents", "metadatas", "distances"],
        )
        collection_result = collection.get(
            include=["documents", "metadatas"],
        )
    except Exception as exc:
        raise HybridSearchError("ChromaDB 하이브리드 검색에 실패했습니다.") from exc

    vector_ranked = _vector_rank(vector_result)
    all_documents = _documents_from_get_result(collection_result)
    lexical_ranked = _bm25_rank(
        query,
        all_documents,
        limit=candidate_k,
    )
    candidates = _fuse_candidates(vector_ranked, lexical_ranked)
    if not candidates:
        return []

    if reranker is not None:
        try:
            reranked = reranker.rerank(
                query,
                [candidate.document.text for candidate in candidates],
                top_n=len(candidates),
            )
        except RerankerError:
            reranked = []
        if reranked:
            external_results: list[RankedCandidate] = []
            for result in reranked:
                candidate = candidates[result.index]
                if result.relevance_score < min_relevance_score:
                    continue
                external_results.append(
                    RankedCandidate(
                        document=candidate.document,
                        vector_score=candidate.vector_score,
                        lexical_score=candidate.lexical_score,
                        fusion_score=candidate.fusion_score,
                        legal_token_coverage=(
                            candidate.legal_token_coverage
                        ),
                        relevance_score=result.relevance_score,
                        ordering_score=result.relevance_score,
                    )
                )
            return external_results[:top_k]

    vector_top_ids = {
        document.document_id for document, _score in vector_ranked[:top_k]
    }
    local_candidates = [
        candidate
        for candidate in candidates
        if (
            candidate.document.document_id in vector_top_ids
            or candidate.legal_token_coverage > 0
        )
    ]
    return [
        candidate
        for candidate in local_candidates
        if candidate.relevance_score >= min_relevance_score
    ][:top_k]
