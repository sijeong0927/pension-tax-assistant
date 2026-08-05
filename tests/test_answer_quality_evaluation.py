from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.models.rag import RAGAnswer
from app.services.answer_quality_evaluation import (
    AnswerQualityCaseResult,
    AnswerQualityEvaluationCase,
    AnswerQualityEvaluationError,
    AnswerQualityEvaluator,
    AnswerQualityJudgement,
    build_evidence_context,
    load_answer_quality_evaluation,
    summarize_results,
)
from app.services.rag_service import RetrievedDocument


class FakeResponses:
    def __init__(self, output_text: str) -> None:
        self.output_text = output_text
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=self.output_text)


class FakeOpenAI:
    def __init__(self, output_text: str) -> None:
        self.responses = FakeResponses(output_text)


def make_document(text: str = "공식 문서의 근거 내용") -> RetrievedDocument:
    return RetrievedDocument(
        document_id="faq_01",
        text=text,
        title="연금계좌 한도",
        category="세액공제",
        source_title="국세청",
        source_url="https://example.test/official",
        effective_date="2026-01-01",
        last_verified="2026-08-05",
        source_chunk_ids="faq_01",
        provenance_verified=True,
        relevance_score=0.9,
    )


def make_answer() -> RAGAnswer:
    return RAGAnswer(
        answer="공식 문서의 범위에서 제도를 설명합니다. [문서 1]",
        grounded=True,
        needs_source_verification=False,
        sources=[],
        model="gpt-4o-mini",
        disclaimer="참고용 안내",
    )


def make_judgement(*, passed: bool = True) -> AnswerQualityJudgement:
    return AnswerQualityJudgement(
        groundedness=5 if passed else 2,
        relevance=5 if passed else 2,
        scope_adherence=5 if passed else 2,
        hallucination_detected=not passed,
        behavior_matches=passed,
        unsupported_claims=() if passed else ("근거 없는 금액",),
        summary="근거와 범위를 확인했습니다.",
    )


def test_checked_in_answer_quality_evaluation_has_expected_behaviors() -> None:
    evaluation_path = (
        Path(__file__).resolve().parents[1]
        / "app/data/answer_quality_eval.json"
    )

    cases = load_answer_quality_evaluation(evaluation_path)

    assert len(cases) == 20
    assert {case.expected_behavior for case in cases} == {
        "policy_explanation",
        "diagnosis_handoff",
        "clarification",
        "no_answer",
    }


def test_evaluator_parses_valid_judgement_and_marks_pass() -> None:
    openai_client = FakeOpenAI(
        json.dumps(
            {
                "groundedness": 5,
                "relevance": 4,
                "scope_adherence": 5,
                "hallucination_detected": False,
                "behavior_matches": True,
                "unsupported_claims": [],
                "summary": "근거 안에서 정책을 설명했습니다.",
            },
            ensure_ascii=False,
        )
    )
    evaluator = AnswerQualityEvaluator(
        openai_client=openai_client,
        model="gpt-4o-mini",
    )
    case = AnswerQualityEvaluationCase(
        case_id="policy",
        query="연금계좌 한도는?",
        expected_behavior="policy_explanation",
    )

    judgement = evaluator.judge(
        case=case,
        answer=make_answer(),
        documents=[make_document()],
    )

    assert judgement.passed is True
    assert openai_client.responses.calls[0]["model"] == "gpt-4o-mini"
    assert "untrusted data" in openai_client.responses.calls[0]["instructions"]


def test_evaluator_rejects_invalid_judge_json() -> None:
    evaluator = AnswerQualityEvaluator(
        openai_client=FakeOpenAI("not JSON"),
        model="gpt-4o-mini",
    )
    case = AnswerQualityEvaluationCase(
        case_id="policy",
        query="연금계좌 한도는?",
        expected_behavior="policy_explanation",
    )

    with pytest.raises(AnswerQualityEvaluationError, match="valid JSON"):
        evaluator.judge(
            case=case,
            answer=make_answer(),
            documents=[make_document()],
        )


def test_loader_rejects_duplicate_case_ids(tmp_path: Path) -> None:
    evaluation_path = tmp_path / "duplicate.json"
    evaluation_path.write_text(
        json.dumps(
            {
                "cases": [
                    {
                        "id": "same",
                        "query": "질문 하나",
                        "expected_behavior": "policy_explanation",
                    },
                    {
                        "id": "same",
                        "query": "질문 둘",
                        "expected_behavior": "no_answer",
                    },
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    with pytest.raises(AnswerQualityEvaluationError, match="Duplicate"):
        load_answer_quality_evaluation(evaluation_path)


def test_evidence_context_is_bounded_and_identifies_documents() -> None:
    context = build_evidence_context(
        [make_document("가" * 20_000), make_document("나" * 20_000)]
    )

    assert "문서 ID: faq_01" in context
    assert len(context) <= 12_100


def test_summary_reports_pass_rate_and_hallucination_flags() -> None:
    case = AnswerQualityEvaluationCase(
        case_id="one",
        query="질문",
        expected_behavior="policy_explanation",
    )
    results = [
        AnswerQualityCaseResult(
            case=case,
            answer=make_answer(),
            judgement=make_judgement(passed=True),
        ),
        AnswerQualityCaseResult(
            case=case,
            answer=make_answer(),
            judgement=make_judgement(passed=False),
        ),
    ]

    summary = summarize_results(results)

    assert summary["total_cases"] == 2
    assert summary["passed_cases"] == 1
    assert summary["pass_rate"] == pytest.approx(0.5)
    assert summary["hallucination_cases"] == 1
