from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence


ALLOWED_EVALUATION_KINDS = {
    "legal_reference",
    "numeric",
    "general",
    "out_of_scope",
}
_PDF_CHUNK_SUFFIX = re.compile(
    r"page_(\d{3})_chunk_(\d{2,3})$",
)


class RetrievalEvaluationError(ValueError):
    """검색 평가셋 또는 평가 입력이 유효하지 않을 때 발생하는 예외."""


@dataclass(frozen=True)
class RetrievalEvaluationCase:
    case_id: str
    kind: str
    query: str
    expected_document_ids: tuple[str, ...]

    @property
    def in_scope(self) -> bool:
        return self.kind != "out_of_scope"


@dataclass(frozen=True)
class RetrievalMetrics:
    in_scope_cases: int
    out_of_scope_cases: int
    recall_at_k: float
    hit_rate_at_k: float
    mean_reciprocal_rank: float
    out_of_scope_no_answer_rate: float

    def to_dict(self) -> dict[str, int | float]:
        return asdict(self)


def canonical_document_id(document_id: str) -> str:
    """재청킹 후에도 같은 PDF 페이지의 근거를 동일하게 비교한다."""
    match = _PDF_CHUNK_SUFFIX.search(document_id)
    if match is None:
        return document_id
    page_number = int(match.group(1))
    return f"pdf_page_{page_number:03d}"


def load_retrieval_evaluation(
    path: Path,
) -> tuple[RetrievalEvaluationCase, ...]:
    try:
        with path.open(encoding="utf-8") as evaluation_file:
            raw_evaluation = json.load(evaluation_file)
    except FileNotFoundError as exc:
        raise RetrievalEvaluationError(
            f"검색 평가셋을 찾을 수 없습니다: {path}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise RetrievalEvaluationError(
            f"검색 평가셋 JSON 형식이 올바르지 않습니다: {exc.msg}"
        ) from exc

    if not isinstance(raw_evaluation, dict):
        raise RetrievalEvaluationError("검색 평가셋 최상위 값은 객체여야 합니다.")
    raw_cases = raw_evaluation.get("cases")
    if not isinstance(raw_cases, list) or not raw_cases:
        raise RetrievalEvaluationError(
            "검색 평가셋에는 하나 이상의 cases가 필요합니다."
        )
    if len(raw_cases) > 32:
        raise RetrievalEvaluationError(
            "API 과사용 방지를 위해 평가 질의는 최대 32개로 제한합니다."
        )

    cases: list[RetrievalEvaluationCase] = []
    seen_case_ids: set[str] = set()
    for index, raw_case in enumerate(raw_cases):
        prefix = f"cases[{index}]"
        if not isinstance(raw_case, dict):
            raise RetrievalEvaluationError(f"{prefix}는 객체여야 합니다.")
        case_id = raw_case.get("id")
        kind = raw_case.get("kind")
        query = raw_case.get("query")
        expected_ids = raw_case.get("expected_document_ids")
        if not isinstance(case_id, str) or not case_id.strip():
            raise RetrievalEvaluationError(
                f"{prefix}.id는 비어 있지 않은 문자열이어야 합니다."
            )
        case_id = case_id.strip()
        if case_id in seen_case_ids:
            raise RetrievalEvaluationError(
                f"중복 검색 평가 ID가 있습니다: {case_id}"
            )
        if kind not in ALLOWED_EVALUATION_KINDS:
            raise RetrievalEvaluationError(
                f"{prefix}.kind는 지원되는 평가 유형이어야 합니다."
            )
        if not isinstance(query, str) or not query.strip():
            raise RetrievalEvaluationError(
                f"{prefix}.query는 비어 있지 않은 문자열이어야 합니다."
            )
        if not isinstance(expected_ids, list) or not all(
            isinstance(document_id, str) and document_id.strip()
            for document_id in expected_ids
        ):
            raise RetrievalEvaluationError(
                f"{prefix}.expected_document_ids는 문자열 배열이어야 합니다."
            )
        if kind == "out_of_scope" and expected_ids:
            raise RetrievalEvaluationError(
                f"{prefix} 범위 밖 질의에는 기대 문서가 없어야 합니다."
            )
        if kind != "out_of_scope" and not expected_ids:
            raise RetrievalEvaluationError(
                f"{prefix} 범위 안 질의에는 기대 문서가 필요합니다."
            )

        seen_case_ids.add(case_id)
        cases.append(
            RetrievalEvaluationCase(
                case_id=case_id,
                kind=str(kind),
                query=query.strip(),
                expected_document_ids=tuple(
                    canonical_document_id(document_id.strip())
                    for document_id in expected_ids
                ),
            )
        )
    return tuple(cases)


def evaluate_rankings(
    cases: Sequence[RetrievalEvaluationCase],
    rankings: Mapping[str, Sequence[str]],
    *,
    top_k: int,
) -> RetrievalMetrics:
    if top_k <= 0:
        raise RetrievalEvaluationError("top_k는 1 이상이어야 합니다.")

    in_scope_cases = [case for case in cases if case.in_scope]
    out_of_scope_cases = [case for case in cases if not case.in_scope]
    recall_total = 0.0
    hit_total = 0
    reciprocal_rank_total = 0.0
    for case in in_scope_cases:
        expected_ids = set(case.expected_document_ids)
        predicted_ids = [
            canonical_document_id(document_id)
            for document_id in rankings.get(case.case_id, ())[:top_k]
        ]
        matched_ids = expected_ids.intersection(predicted_ids)
        recall_total += len(matched_ids) / len(expected_ids)
        if matched_ids:
            hit_total += 1
        first_relevant_rank = next(
            (
                rank
                for rank, document_id in enumerate(predicted_ids, start=1)
                if document_id in expected_ids
            ),
            None,
        )
        if first_relevant_rank is not None:
            reciprocal_rank_total += 1 / first_relevant_rank

    no_answer_total = sum(
        not rankings.get(case.case_id) for case in out_of_scope_cases
    )
    in_scope_count = len(in_scope_cases)
    out_of_scope_count = len(out_of_scope_cases)
    return RetrievalMetrics(
        in_scope_cases=in_scope_count,
        out_of_scope_cases=out_of_scope_count,
        recall_at_k=(
            recall_total / in_scope_count if in_scope_count else 0.0
        ),
        hit_rate_at_k=hit_total / in_scope_count if in_scope_count else 0.0,
        mean_reciprocal_rank=(
            reciprocal_rank_total / in_scope_count
            if in_scope_count
            else 0.0
        ),
        out_of_scope_no_answer_rate=(
            no_answer_total / out_of_scope_count
            if out_of_scope_count
            else 0.0
        ),
    )


def metrics_improvement(
    baseline: RetrievalMetrics,
    candidate: RetrievalMetrics,
) -> dict[str, float]:
    return {
        "recall_at_k": candidate.recall_at_k - baseline.recall_at_k,
        "hit_rate_at_k": candidate.hit_rate_at_k - baseline.hit_rate_at_k,
        "mean_reciprocal_rank": (
            candidate.mean_reciprocal_rank
            - baseline.mean_reciprocal_rank
        ),
        "out_of_scope_no_answer_rate": (
            candidate.out_of_scope_no_answer_rate
            - baseline.out_of_scope_no_answer_rate
        ),
    }
