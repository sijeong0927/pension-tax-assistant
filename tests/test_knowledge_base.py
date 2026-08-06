from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.knowledge_base import (
    KnowledgeBaseValidationError,
    load_knowledge_base,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_load_current_knowledge_base_has_verified_provenance() -> None:
    report = load_knowledge_base(PROJECT_ROOT / "app/data/tax_faq.json")

    assert len(report.documents) == 61
    assert report.documents[0].document_id == "guide_00"
    assert report.warnings == ()
    assert all(
        document.provenance_verified for document in report.documents
    )


def test_strict_provenance_accepts_current_knowledge_base() -> None:
    report = load_knowledge_base(
        PROJECT_ROOT / "app/data/tax_faq.json",
        strict_provenance=True,
    )

    assert len(report.documents) == 61


def test_general_year_end_faqs_reference_preindexed_nts_chunks() -> None:
    report = load_knowledge_base(PROJECT_ROOT / "app/data/tax_faq.json")
    documents = {document.document_id: document for document in report.documents}

    for number in range(31, 42):
        document = documents[f"faq_{number}"]
        assert document.source_url.startswith("https://www.nts.go.kr/")
        assert document.source_chunk_ids.startswith("pdf_page_")


def test_extended_faqs_have_distinct_questions_and_verified_provenance() -> None:
    report = load_knowledge_base(
        PROJECT_ROOT / "app/data/tax_faq.json",
        strict_provenance=True,
    )
    documents = {document.document_id: document for document in report.documents}

    assert {f"faq_{number}" for number in range(42, 61)} <= documents.keys()
    assert all(
        documents[f"faq_{number}"].provenance_verified
        for number in range(42, 61)
    )
    assert "해당 과세기간" in documents["faq_42"].text
    assert "5년 이내" in documents["faq_59"].text
    assert "신분증" in documents["faq_60"].text


def test_corrected_faqs_use_official_sources_and_safe_tax_wording() -> None:
    report = load_knowledge_base(PROJECT_ROOT / "app/data/tax_faq.json")
    documents = {document.document_id: document for document in report.documents}

    assert "세액공제 대상 납입한도" in documents["faq_22"].text
    assert "과세대상 공적연금소득" in documents["faq_23"].text
    assert "총급여나 종합소득의 3% 기준은 이 요건이 아닙니다" in documents["faq_26"].text
    assert "배우자 외 상속인은 연금계좌를 승계할 수 없습니다" in documents["faq_28"].text
    assert "연금보험료등소득ㆍ세액공제확인서" in documents["faq_29"].text
    assert documents["faq_26"].source_url.startswith("https://www.law.go.kr/")
    assert documents["faq_29"].source_url.startswith("https://law.go.kr/")


def test_duplicate_questions_are_rejected(tmp_path: Path) -> None:
    payload = {
        "last_updated": "2026-08-04",
        "faqs": [
            {
                "id": "faq_01",
                "category": "한도",
                "question": "납입 한도는 얼마인가요?",
                "answer": "답변 1",
            },
            {
                "id": "faq_02",
                "category": "한도",
                "question": "  납입   한도는 얼마인가요? ",
                "answer": "답변 2",
            },
        ],
    }
    path = tmp_path / "duplicate.json"
    path.write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8",
    )

    with pytest.raises(KnowledgeBaseValidationError, match="중복 FAQ 질문"):
        load_knowledge_base(path)
