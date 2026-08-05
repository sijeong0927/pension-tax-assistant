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
from app.services.answer_quality_evaluation import (
    AnswerQualityCaseResult,
    AnswerQualityEvaluationError,
    AnswerQualityEvaluator,
    load_answer_quality_evaluation,
    summarize_results,
)
from app.services.rag_service import (
    KnowledgeBaseNotIndexedError,
    RAGService,
    RAGServiceError,
)


DEFAULT_EVALUATION_PATH = PROJECT_ROOT / "app/data/answer_quality_eval.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate RAG answer groundedness, relevance, hallucination risk, "
            "and policy-only scope with an offline LLM judge."
        ),
    )
    parser.add_argument(
        "--evaluation",
        type=Path,
        default=DEFAULT_EVALUATION_PATH,
        help="Answer-quality evaluation JSON path.",
    )
    parser.add_argument(
        "--judge-model",
        help="OpenAI model for the offline judge (defaults to OPENAI_CHAT_MODEL).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional JSON report path. The terminal summary is always printed.",
    )
    return parser


def evaluate(
    *,
    evaluation_path: Path,
    judge_model: str | None = None,
    service: RAGService | None = None,
    evaluator: AnswerQualityEvaluator | None = None,
) -> dict[str, Any]:
    cases = load_answer_quality_evaluation(evaluation_path)
    rag_service = service or RAGService()
    selected_judge_model = judge_model or rag_service.settings.openai_chat_model
    quality_evaluator = evaluator or AnswerQualityEvaluator(
        openai_client=rag_service._get_openai_client(),
        model=selected_judge_model,
    )

    results: list[AnswerQualityCaseResult] = []
    for case in cases:
        retrieved = rag_service.retrieve(case.query)
        answer = rag_service.answer_from_retrieved_documents(
            case.query,
            retrieved,
        )
        judgement = quality_evaluator.judge(
            case=case,
            answer=answer,
            documents=retrieved,
        )
        results.append(
            AnswerQualityCaseResult(
                case=case,
                answer=answer,
                judgement=judgement,
            )
        )

    return {
        "evaluation_path": str(evaluation_path),
        "judge_model": selected_judge_model,
        "summary": summarize_results(results),
        "cases": [result.to_dict() for result in results],
    }


def print_terminal_summary(report: dict[str, Any]) -> None:
    summary = report["summary"]
    print("Answer quality evaluation")
    print(
        "id                              pass  ground  relevant  scope  hallucination"
    )
    for result in report["cases"]:
        judgement = result["judgement"]
        verdict = "PASS" if judgement["passed"] else "FAIL"
        hallucination = "yes" if judgement["hallucination_detected"] else "no"
        print(
            f"{result['id'][:30]:30}  {verdict:4}  "
            f"{judgement['groundedness']:>6}  "
            f"{judgement['relevance']:>8}  "
            f"{judgement['scope_adherence']:>5}  {hallucination}"
        )
    print()
    print(
        "Summary: "
        f"{summary['passed_cases']}/{summary['total_cases']} passed "
        f"({summary['pass_rate']:.0%}), "
        f"hallucination flags={summary['hallucination_cases']}, "
        f"average groundedness={summary['average_groundedness']:.2f}, "
        f"relevance={summary['average_relevance']:.2f}, "
        f"scope={summary['average_scope_adherence']:.2f}"
    )


def _write_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        report = evaluate(
            evaluation_path=args.evaluation.resolve(),
            judge_model=args.judge_model,
        )
    except (
        AnswerQualityEvaluationError,
        ConfigurationError,
        KnowledgeBaseNotIndexedError,
        OSError,
        RAGServiceError,
    ) as exc:
        print(f"Answer-quality evaluation failed: {exc}", file=sys.stderr)
        return 1

    print_terminal_summary(report)
    if args.output is not None:
        output_path = args.output.resolve()
        _write_report(output_path, report)
        print(f"Detailed JSON report: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
