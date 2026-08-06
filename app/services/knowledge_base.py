from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any


class KnowledgeBaseValidationError(ValueError):
    """지식베이스 스키마 또는 데이터가 유효하지 않을 때 발생하는 예외."""


@dataclass(frozen=True)
class KnowledgeDocument:
    document_id: str
    title: str
    category: str
    text: str
    dataset_updated_at: str
    source_title: str
    source_url: str
    effective_date: str
    last_verified: str
    source_chunk_ids: str
    provenance_verified: bool

    def to_metadata(self) -> dict[str, str | bool]:
        return {
            "title": self.title,
            "category": self.category,
            "dataset_updated_at": self.dataset_updated_at,
            "source_title": self.source_title,
            "source_url": self.source_url,
            "effective_date": self.effective_date,
            "last_verified": self.last_verified,
            "source_chunk_ids": self.source_chunk_ids,
            "provenance_verified": self.provenance_verified,
        }


@dataclass(frozen=True)
class KnowledgeBaseReport:
    documents: tuple[KnowledgeDocument, ...]
    warnings: tuple[str, ...]


def _non_empty_string(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise KnowledgeBaseValidationError(
            f"{field_name}은 비어 있지 않은 문자열이어야 합니다."
        )
    return value.strip()


def _optional_string(value: Any, field_name: str) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise KnowledgeBaseValidationError(f"{field_name}은 문자열이어야 합니다.")
    return value.strip()


def _iso_date(value: str, field_name: str, *, required: bool) -> str:
    if not value:
        if required:
            raise KnowledgeBaseValidationError(f"{field_name}이 필요합니다.")
        return ""
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise KnowledgeBaseValidationError(
            f"{field_name}은 YYYY-MM-DD 형식이어야 합니다."
        ) from exc
    return value


def _normalized(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).lower()
    return re.sub(r"\s+", " ", normalized).strip()


_PDF_CHUNK_ID_PATTERN = re.compile(
    r"(?:pdf_page_\d{3}_chunk_\d{2,3}|"
    r"pdf_[a-z0-9-]+_[0-9a-f]{16}_page_\d{3}_chunk_\d{3})"
)


def _source_chunk_ids(raw_document: dict[str, Any], prefix: str) -> str:
    raw_ids = raw_document.get("source_chunk_ids", [])
    if not isinstance(raw_ids, list) or not all(
        isinstance(chunk_id, str)
        and _PDF_CHUNK_ID_PATTERN.fullmatch(chunk_id)
        for chunk_id in raw_ids
    ):
        raise KnowledgeBaseValidationError(
            f"{prefix}.source_chunk_ids는 PDF 청크 ID 문자열 배열이어야 합니다."
        )
    return ",".join(raw_ids)


def _document_provenance(
    raw_document: dict[str, Any],
    raw_dataset: dict[str, Any],
    *,
    prefix: str,
) -> tuple[str, str, str, str, bool]:
    source_title = _optional_string(
        raw_document.get("source_title", raw_dataset.get("source_title")),
        f"{prefix}.source_title",
    )
    source_url = _optional_string(
        raw_document.get("source_url", raw_dataset.get("source_url")),
        f"{prefix}.source_url",
    )
    effective_date = _iso_date(
        _optional_string(
            raw_document.get("effective_date", raw_dataset.get("effective_date")),
            f"{prefix}.effective_date",
        ),
        f"{prefix}.effective_date",
        required=False,
    )
    last_verified = _iso_date(
        _optional_string(
            raw_document.get("last_verified", raw_dataset.get("last_verified")),
            f"{prefix}.last_verified",
        ),
        f"{prefix}.last_verified",
        required=False,
    )
    verified = all((source_title, source_url, effective_date, last_verified))
    return source_title, source_url, effective_date, last_verified, verified


def load_knowledge_base(
    path: Path,
    *,
    strict_provenance: bool = False,
) -> KnowledgeBaseReport:
    try:
        with path.open(encoding="utf-8") as knowledge_file:
            raw_dataset = json.load(knowledge_file)
    except FileNotFoundError as exc:
        raise KnowledgeBaseValidationError(
            f"지식베이스 파일을 찾을 수 없습니다: {path}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise KnowledgeBaseValidationError(
            f"지식베이스 JSON 형식이 올바르지 않습니다: {exc.msg}"
        ) from exc

    if not isinstance(raw_dataset, dict):
        raise KnowledgeBaseValidationError("지식베이스 최상위 값은 객체여야 합니다.")

    dataset_updated_at = _iso_date(
        _non_empty_string(raw_dataset.get("last_updated"), "last_updated"),
        "last_updated",
        required=True,
    )
    raw_faqs = raw_dataset.get("faqs")
    if not isinstance(raw_faqs, list) or not raw_faqs:
        raise KnowledgeBaseValidationError("faqs는 하나 이상의 항목을 가져야 합니다.")

    documents: list[KnowledgeDocument] = []
    seen_ids: set[str] = set()
    seen_questions: set[str] = set()

    raw_guide = raw_dataset.get("guide")
    if raw_guide is not None:
        if not isinstance(raw_guide, dict):
            raise KnowledgeBaseValidationError("guide는 객체여야 합니다.")
        guide_title = _non_empty_string(raw_guide.get("title"), "guide.title")
        guide_content = _non_empty_string(raw_guide.get("content"), "guide.content")
        source_title, source_url, effective_date, last_verified, verified = (
            _document_provenance(raw_guide, raw_dataset, prefix="guide")
        )
        documents.append(
            KnowledgeDocument(
                document_id="guide_00",
                title=guide_title,
                category="가이드",
                text=f"제목: {guide_title}\n내용: {guide_content}",
                dataset_updated_at=dataset_updated_at,
                source_title=source_title,
                source_url=source_url,
                effective_date=effective_date,
                last_verified=last_verified,
                source_chunk_ids=_source_chunk_ids(raw_guide, "guide"),
                provenance_verified=verified,
            )
        )
        seen_ids.add("guide_00")

    for index, raw_faq in enumerate(raw_faqs):
        prefix = f"faqs[{index}]"
        if not isinstance(raw_faq, dict):
            raise KnowledgeBaseValidationError(f"{prefix}는 객체여야 합니다.")

        document_id = _non_empty_string(raw_faq.get("id"), f"{prefix}.id")
        category = _non_empty_string(
            raw_faq.get("category"),
            f"{prefix}.category",
        )
        question = _non_empty_string(
            raw_faq.get("question"),
            f"{prefix}.question",
        )
        answer = _non_empty_string(raw_faq.get("answer"), f"{prefix}.answer")

        normalized_question = _normalized(question)
        if document_id in seen_ids:
            raise KnowledgeBaseValidationError(
                f"중복 문서 ID가 있습니다: {document_id}"
            )
        if normalized_question in seen_questions:
            raise KnowledgeBaseValidationError(
                f"중복 FAQ 질문이 있습니다: {question}"
            )
        seen_ids.add(document_id)
        seen_questions.add(normalized_question)

        source_title, source_url, effective_date, last_verified, verified = (
            _document_provenance(raw_faq, raw_dataset, prefix=prefix)
        )
        documents.append(
            KnowledgeDocument(
                document_id=document_id,
                title=question,
                category=category,
                text=f"질문: {question}\n답변: {answer}",
                dataset_updated_at=dataset_updated_at,
                source_title=source_title,
                source_url=source_url,
                effective_date=effective_date,
                last_verified=last_verified,
                source_chunk_ids=_source_chunk_ids(raw_faq, prefix),
                provenance_verified=verified,
            )
        )

    unverified_count = sum(
        not document.provenance_verified for document in documents
    )
    warnings: list[str] = []
    if unverified_count:
        warnings.append(
            f"{unverified_count}개 문서에 source_title, source_url, "
            "effective_date 또는 last_verified 메타데이터가 없습니다."
        )
    if strict_provenance and warnings:
        raise KnowledgeBaseValidationError(
            "출처 검증에 실패했습니다: " + " ".join(warnings)
        )

    return KnowledgeBaseReport(
        documents=tuple(documents),
        warnings=tuple(warnings),
    )
