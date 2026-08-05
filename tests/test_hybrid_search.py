from __future__ import annotations

from typing import Any, Mapping, Sequence

import pytest

from app.services.hybrid_search import (
    COHERE_RERANK_URL,
    CohereReranker,
    RerankerError,
    RerankResult,
    SearchDocument,
    hybrid_search,
    tokenize_for_bm25,
)


def make_document(document_id: str, text: str) -> SearchDocument:
    return SearchDocument(
        document_id=document_id,
        text=text,
        metadata={
            "title": document_id,
            "category": "테스트",
            "provenance_verified": True,
        },
    )


class FakeCollection:
    def __init__(
        self,
        *,
        documents: Sequence[SearchDocument],
        vector_ids: Sequence[str],
        distances: Sequence[float],
    ) -> None:
        self.documents = {
            document.document_id: document for document in documents
        }
        self.vector_ids = list(vector_ids)
        self.distances = list(distances)
        self.query_calls: list[dict[str, Any]] = []

    def query(self, **kwargs: Any) -> dict[str, Any]:
        self.query_calls.append(kwargs)
        selected_ids = self.vector_ids[: kwargs["n_results"]]
        selected_documents = [
            self.documents[document_id] for document_id in selected_ids
        ]
        return {
            "ids": [selected_ids],
            "documents": [
                [document.text for document in selected_documents]
            ],
            "metadatas": [
                [dict(document.metadata) for document in selected_documents]
            ],
            "distances": [self.distances[: len(selected_ids)]],
        }

    def get(self, **_: Any) -> dict[str, Any]:
        documents = list(self.documents.values())
        return {
            "ids": [document.document_id for document in documents],
            "documents": [document.text for document in documents],
            "metadatas": [dict(document.metadata) for document in documents],
        }


class ExactDocumentReranker:
    def rerank(
        self,
        query: str,
        documents: Sequence[str],
        *,
        top_n: int,
    ) -> Sequence[RerankResult]:
        assert query
        assert top_n == len(documents)
        exact_index = next(
            index for index, document in enumerate(documents) if "정확한 근거" in document
        )
        other_indices = [
            index for index in range(len(documents)) if index != exact_index
        ]
        return [
            RerankResult(index=exact_index, relevance_score=0.97),
            *[
                RerankResult(index=index, relevance_score=0.1)
                for index in other_indices
            ],
        ]


class FailingReranker:
    def rerank(
        self,
        query: str,
        documents: Sequence[str],
        *,
        top_n: int,
    ) -> Sequence[RerankResult]:
        raise RerankerError("temporary failure")


def test_tokenizer_preserves_law_amount_and_percentage_tokens() -> None:
    tokens = tokenize_for_bm25(
        "소득세법 제 59 조의 3, 9,000,000원과 16.5 %"
    )

    assert "제59조의3" in tokens
    assert "9000000원" in tokens
    assert "16.5%" in tokens


def test_tokenizer_normalizes_percent_wording_and_korean_variants() -> None:
    query_tokens = tokenize_for_bm25("신용카드 사용액이 25%를 초과할 때")
    document_tokens = tokenize_for_bm25(
        "신용카드 사용금액이 총급여액의 100분의 25를 초과하는 경우"
    )

    assert "25%" in query_tokens
    assert "25%" in document_tokens
    assert "신용카드" in query_tokens
    assert "신용카드" in document_tokens
    assert "사용" in query_tokens
    assert "사용" in document_tokens


def test_bm25_promotes_exact_law_reference_missing_from_vector_top_one() -> None:
    semantic = make_document(
        "semantic",
        "연금계좌 세액공제의 일반적인 개념을 설명합니다.",
    )
    exact_law = make_document(
        "exact-law",
        "소득세법 제59조의3은 연금계좌 세액공제 한도를 규정합니다.",
    )
    collection = FakeCollection(
        documents=[semantic, exact_law],
        vector_ids=["semantic", "exact-law"],
        distances=[0.1, 0.4],
    )

    results = hybrid_search(
        collection,
        query="소득세법 제59조의3 세액공제 한도",
        query_embedding=[1.0, 0.0],
        candidate_k=1,
        top_k=2,
        min_relevance_score=0.35,
    )

    assert [result.document.document_id for result in results] == [
        "exact-law",
        "semantic",
    ]
    assert collection.query_calls[0]["n_results"] == 1


def test_duplicate_vector_and_bm25_candidates_are_returned_once() -> None:
    document = make_document(
        "same-document",
        "연금계좌 세액공제 한도는 900만 원입니다.",
    )
    collection = FakeCollection(
        documents=[document],
        vector_ids=[document.document_id],
        distances=[0.05],
    )

    results = hybrid_search(
        collection,
        query="연금계좌 세액공제 한도",
        query_embedding=[1.0, 0.0],
        candidate_k=1,
        top_k=1,
        min_relevance_score=0.35,
    )

    assert len(results) == 1
    assert results[0].document.document_id == "same-document"


def test_external_reranker_reorders_and_applies_relevance_threshold() -> None:
    vector_first = make_document(
        "vector-first",
        "연금계좌의 일반 설명입니다.",
    )
    exact = make_document(
        "reranked-first",
        "정확한 근거: 연금계좌 세액공제 한도는 900만 원입니다.",
    )
    collection = FakeCollection(
        documents=[vector_first, exact],
        vector_ids=["vector-first", "reranked-first"],
        distances=[0.05, 0.2],
    )

    results = hybrid_search(
        collection,
        query="연금계좌 세액공제 한도",
        query_embedding=[1.0, 0.0],
        candidate_k=2,
        top_k=2,
        min_relevance_score=0.35,
        reranker=ExactDocumentReranker(),
    )

    assert [result.document.document_id for result in results] == [
        "reranked-first"
    ]
    assert results[0].relevance_score == 0.97


def test_reranker_failure_falls_back_to_local_hybrid_order() -> None:
    document = make_document(
        "fallback",
        "소득세법 제59조의3 연금계좌 세액공제",
    )
    collection = FakeCollection(
        documents=[document],
        vector_ids=[document.document_id],
        distances=[0.1],
    )

    results = hybrid_search(
        collection,
        query="소득세법 제59조의3",
        query_embedding=[1.0, 0.0],
        candidate_k=1,
        top_k=1,
        min_relevance_score=0.35,
        reranker=FailingReranker(),
    )

    assert results[0].document.document_id == "fallback"
    assert results[0].relevance_score >= 0.9


def test_cohere_reranker_sends_bounded_v2_request() -> None:
    captured: dict[str, Any] = {}

    def fake_transport(
        url: str,
        headers: Mapping[str, str],
        payload: Mapping[str, Any],
        timeout_seconds: float,
    ) -> Mapping[str, Any]:
        captured.update(
            {
                "url": url,
                "headers": headers,
                "payload": payload,
                "timeout_seconds": timeout_seconds,
            }
        )
        return {
            "results": [
                {"index": 1, "relevance_score": 0.9},
                {"index": 0, "relevance_score": 0.4},
            ]
        }

    reranker = CohereReranker(
        api_key="test-cohere-key",
        model="rerank-v4.0-fast",
        timeout_seconds=7,
        transport=fake_transport,
    )

    results = reranker.rerank(
        "연금계좌 한도",
        ["첫 문서", "둘째 문서"],
        top_n=5,
    )

    assert captured["url"] == COHERE_RERANK_URL
    assert captured["headers"]["Authorization"] == "Bearer test-cohere-key"
    assert captured["payload"] == {
        "model": "rerank-v4.0-fast",
        "query": "연금계좌 한도",
        "documents": ["첫 문서", "둘째 문서"],
        "top_n": 2,
    }
    assert captured["timeout_seconds"] == 7
    assert results == [
        RerankResult(index=1, relevance_score=0.9),
        RerankResult(index=0, relevance_score=0.4),
    ]


@pytest.mark.parametrize(
    "response",
    [
        {},
        {"results": [{"index": 2, "relevance_score": 0.9}]},
        {"results": [{"index": 0, "relevance_score": 1.1}]},
    ],
)
def test_cohere_reranker_rejects_invalid_responses(
    response: Mapping[str, Any],
) -> None:
    reranker = CohereReranker(
        api_key="test-cohere-key",
        model="rerank-v4.0-fast",
        timeout_seconds=7,
        transport=lambda *_: response,
    )

    with pytest.raises(RerankerError):
        reranker.rerank("질문", ["문서"], top_n=1)
