from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import ConfigurationError
from app.services.hybrid_search import HybridSearchError, hybrid_search
from app.services.rag_service import (
    MAX_RETRIEVAL_DOCUMENTS,
    KnowledgeBaseNotIndexedError,
    RAGService,
    RAGServiceError,
)
from app.services.retrieval_evaluation import (
    RetrievalEvaluationError,
    evaluate_rankings,
    load_retrieval_evaluation,
    metrics_improvement,
)


DEFAULT_EVALUATION_PATH = PROJECT_ROOT / "app/data/retrieval_eval.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Compare vector-only and deterministic hybrid retrieval on the "
            "fixed RAG evaluation set."
        ),
    )
    parser.add_argument(
        "--evaluation",
        type=Path,
        default=DEFAULT_EVALUATION_PATH,
        help="Retrieval evaluation JSON path.",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=4,
        help="Ranking depth used for Recall@k and MRR (default: 4).",
    )
    return parser


def _vector_baseline(
    collection: Any,
    *,
    embedding: Sequence[float],
    top_k: int,
    min_relevance_score: float,
) -> list[dict[str, str | float]]:
    result = collection.query(
        query_embeddings=[list(embedding)],
        n_results=top_k,
        include=["metadatas", "distances"],
    )
    ids = (result.get("ids") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]
    ranked: list[dict[str, str | float]] = []
    for document_id, metadata, distance in zip(ids, metadatas, distances):
        relevance_score = max(0.0, min(1.0, 1.0 - float(distance)))
        if relevance_score < min_relevance_score:
            continue
        metadata = metadata or {}
        ranked.append(
            {
                "document_id": str(document_id),
                "title": str(metadata.get("title") or document_id),
                "relevance_score": round(relevance_score, 6),
            }
        )
    return ranked


def evaluate(
    *,
    evaluation_path: Path,
    top_k: int,
    service: RAGService | None = None,
) -> dict[str, Any]:
    if not 1 <= top_k <= MAX_RETRIEVAL_DOCUMENTS:
        raise RetrievalEvaluationError(
            f"top_k는 1 이상 {MAX_RETRIEVAL_DOCUMENTS} 이하이어야 합니다."
        )
    evaluation_cases = load_retrieval_evaluation(evaluation_path)
    rag_service = service or RAGService()
    collection = rag_service._get_collection()
    document_count = collection.count()
    if document_count == 0:
        raise KnowledgeBaseNotIndexedError(
            "지식베이스가 비어 있습니다. 먼저 인덱싱 스크립트를 실행하세요."
        )

    embeddings = rag_service._embed(
        [evaluation_case.query for evaluation_case in evaluation_cases]
    )
    if len(embeddings) != len(evaluation_cases):
        raise RAGServiceError("평가 질의 임베딩 개수가 일치하지 않습니다.")

    baseline_rankings: dict[str, list[str]] = {}
    hybrid_rankings: dict[str, list[str]] = {}
    case_results: list[dict[str, Any]] = []
    candidate_k = min(
        max(rag_service.settings.rag_candidate_k, top_k),
        document_count,
    )
    for evaluation_case, embedding in zip(evaluation_cases, embeddings):
        vector_results = _vector_baseline(
            collection,
            embedding=embedding,
            top_k=min(top_k, document_count),
            min_relevance_score=(
                rag_service.settings.rag_min_relevance_score
            ),
        )
        hybrid_results = hybrid_search(
            collection,
            query=evaluation_case.query,
            query_embedding=embedding,
            candidate_k=candidate_k,
            top_k=top_k,
            min_relevance_score=(
                rag_service.settings.rag_min_relevance_score
            ),
            reranker=None,
        )
        baseline_rankings[evaluation_case.case_id] = [
            str(result["document_id"]) for result in vector_results
        ]
        hybrid_rankings[evaluation_case.case_id] = [
            result.document.document_id for result in hybrid_results
        ]
        case_results.append(
            {
                "id": evaluation_case.case_id,
                "kind": evaluation_case.kind,
                "query": evaluation_case.query,
                "expected_document_ids": list(
                    evaluation_case.expected_document_ids
                ),
                "vector": vector_results,
                "hybrid": [
                    {
                        "document_id": result.document.document_id,
                        "title": str(
                            result.document.metadata.get("title")
                            or result.document.document_id
                        ),
                        "relevance_score": round(
                            result.relevance_score,
                            6,
                        ),
                        "vector_score": round(result.vector_score, 6),
                        "bm25_score": round(result.lexical_score, 6),
                        "rrf_score": round(result.fusion_score, 6),
                    }
                    for result in hybrid_results
                ],
            }
        )

    baseline_metrics = evaluate_rankings(
        evaluation_cases,
        baseline_rankings,
        top_k=top_k,
    )
    hybrid_metrics = evaluate_rankings(
        evaluation_cases,
        hybrid_rankings,
        top_k=top_k,
    )
    return {
        "evaluation_path": str(evaluation_path),
        "document_count": document_count,
        "top_k": top_k,
        "candidate_k": candidate_k,
        "reranker": "disabled_for_deterministic_evaluation",
        "vector_baseline": baseline_metrics.to_dict(),
        "hybrid": hybrid_metrics.to_dict(),
        "improvement": metrics_improvement(
            baseline_metrics,
            hybrid_metrics,
        ),
        "cases": case_results,
    }


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        report = evaluate(
            evaluation_path=args.evaluation.resolve(),
            top_k=args.top_k,
        )
    except (
        ConfigurationError,
        HybridSearchError,
        OSError,
        RAGServiceError,
        RetrievalEvaluationError,
    ) as exc:
        print(f"Retrieval evaluation failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
