from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Sequence

from app.models.rag import RAGAnswer
from app.services.answer_quality_evaluation import (
    AnswerQualityEvaluationCase,
    AnswerQualityJudgement,
)
from app.services.rag_service import RetrievedDocument
from scripts.evaluate_answer_quality import evaluate, print_terminal_summary


class FakeRAGService:
    def __init__(self) -> None:
        self.settings = SimpleNamespace(openai_chat_model="gpt-4o-mini")
        self.answered_questions: list[str] = []

    def retrieve(self, question: str) -> list[RetrievedDocument]:
        return [
            RetrievedDocument(
                document_id="faq_01",
                text="공식 근거",
                title="공식 문서",
                category="가이드",
                source_title="국세청",
                source_url="https://example.test/official",
                effective_date="2026-01-01",
                last_verified="2026-08-05",
                source_chunk_ids="faq_01",
                provenance_verified=True,
                relevance_score=0.9,
            )
        ]

    def answer_from_retrieved_documents(
        self,
        question: str,
        documents: Sequence[RetrievedDocument],
    ) -> RAGAnswer:
        self.answered_questions.append(question)
        return RAGAnswer(
            answer="정책을 설명하고 진단 기능을 안내합니다. [문서 1]",
            grounded=True,
            needs_source_verification=False,
            sources=[document.to_source() for document in documents],
            model="gpt-4o-mini",
            disclaimer="참고용 안내",
        )


class FakeEvaluator:
    def judge(
        self,
        *,
        case: AnswerQualityEvaluationCase,
        answer: RAGAnswer,
        documents: Sequence[RetrievedDocument],
    ) -> AnswerQualityJudgement:
        return AnswerQualityJudgement(
            groundedness=5,
            relevance=4,
            scope_adherence=5,
            hallucination_detected=False,
            behavior_matches=True,
            unsupported_claims=(),
            summary="통과",
        )


def test_evaluate_prints_a_terminal_ready_report(
    tmp_path: Path,
    capsys: object,
) -> None:
    evaluation_path = tmp_path / "evaluation.json"
    evaluation_path.write_text(
        json.dumps(
            {
                "cases": [
                    {
                        "id": "policy_case",
                        "query": "연금계좌 한도는?",
                        "expected_behavior": "policy_explanation",
                    }
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    service = FakeRAGService()

    report = evaluate(
        evaluation_path=evaluation_path,
        service=service,  # type: ignore[arg-type]
        evaluator=FakeEvaluator(),  # type: ignore[arg-type]
    )
    print_terminal_summary(report)

    captured = capsys.readouterr()  # type: ignore[union-attr]
    assert service.answered_questions == ["연금계좌 한도는?"]
    assert report["summary"]["pass_rate"] == 1
    assert "policy_case" in captured.out
    assert "1/1 passed" in captured.out
