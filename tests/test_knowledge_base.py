from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.knowledge_base import (
    KnowledgeBaseValidationError,
    load_knowledge_base,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_load_current_knowledge_base_reports_missing_provenance() -> None:
    report = load_knowledge_base(PROJECT_ROOT / "app/data/tax_faq.json")

    assert len(report.documents) == 21
    assert report.documents[0].document_id == "guide_00"
    assert report.warnings
    assert all(
        not document.provenance_verified for document in report.documents
    )


def test_strict_provenance_rejects_current_draft_data() -> None:
    with pytest.raises(KnowledgeBaseValidationError, match="출처 검증"):
        load_knowledge_base(
            PROJECT_ROOT / "app/data/tax_faq.json",
            strict_provenance=True,
        )


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
