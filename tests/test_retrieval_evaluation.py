from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.retrieval_evaluation import (
    RetrievalEvaluationCase,
    RetrievalEvaluationError,
    canonical_document_id,
    evaluate_rankings,
    load_retrieval_evaluation,
    metrics_improvement,
)


def test_canonical_document_id_ignores_pdf_source_namespace() -> None:
    document_id = (
        "pdf_nts-2025-year-end-tax-guide_54a1d1c415968283_"
        "page_183_chunk_001"
    )

    assert canonical_document_id(document_id) == "pdf_page_183"
    assert canonical_document_id("faq_01") == "faq_01"


def test_checked_in_evaluation_set_covers_required_query_kinds() -> None:
    evaluation_path = (
        Path(__file__).resolve().parents[1]
        / "app/data/retrieval_eval.json"
    )

    cases = load_retrieval_evaluation(evaluation_path)

    assert len(cases) == 9
    assert {case.kind for case in cases} == {
        "legal_reference",
        "numeric",
        "general",
        "out_of_scope",
    }


def test_evaluate_rankings_calculates_recall_mrr_and_no_answer() -> None:
    cases = (
        RetrievalEvaluationCase(
            case_id="one",
            kind="numeric",
            query="첫 질의",
            expected_document_ids=("doc-a", "doc-b"),
        ),
        RetrievalEvaluationCase(
            case_id="two",
            kind="general",
            query="둘째 질의",
            expected_document_ids=("doc-c",),
        ),
        RetrievalEvaluationCase(
            case_id="outside",
            kind="out_of_scope",
            query="날씨",
            expected_document_ids=(),
        ),
    )

    metrics = evaluate_rankings(
        cases,
        {
            "one": ["irrelevant", "doc-a"],
            "two": ["doc-c"],
            "outside": [],
        },
        top_k=2,
    )

    assert metrics.in_scope_cases == 2
    assert metrics.out_of_scope_cases == 1
    assert metrics.recall_at_k == pytest.approx(0.75)
    assert metrics.hit_rate_at_k == 1
    assert metrics.mean_reciprocal_rank == pytest.approx(0.75)
    assert metrics.out_of_scope_no_answer_rate == 1


def test_metrics_improvement_reports_candidate_minus_baseline() -> None:
    case = RetrievalEvaluationCase(
        case_id="one",
        kind="numeric",
        query="질의",
        expected_document_ids=("relevant",),
    )
    baseline = evaluate_rankings(
        (case,),
        {"one": ["irrelevant"]},
        top_k=1,
    )
    candidate = evaluate_rankings(
        (case,),
        {"one": ["relevant"]},
        top_k=1,
    )

    improvement = metrics_improvement(baseline, candidate)

    assert improvement["recall_at_k"] == 1
    assert improvement["mean_reciprocal_rank"] == 1


def test_evaluation_set_rejects_out_of_scope_expected_documents(
    tmp_path: Path,
) -> None:
    evaluation_path = tmp_path / "invalid.json"
    evaluation_path.write_text(
        json.dumps(
            {
                "cases": [
                    {
                        "id": "outside",
                        "kind": "out_of_scope",
                        "query": "날씨",
                        "expected_document_ids": ["doc-a"],
                    }
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    with pytest.raises(RetrievalEvaluationError, match="기대 문서"):
        load_retrieval_evaluation(evaluation_path)
