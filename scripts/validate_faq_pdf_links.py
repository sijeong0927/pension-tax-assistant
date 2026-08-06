from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

# Add project root to sys.path.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.knowledge_base import load_knowledge_base
from scripts.index_pdf import build_pdf_documents, source_for_pdf


class FAQPDFLinkValidationError(ValueError):
    """FAQ가 가리키는 PDF 청크를 검증할 수 없을 때 발생한다."""


@dataclass(frozen=True)
class FAQPDFLinkValidationResult:
    faq_count: int
    chunk_link_count: int
    source_count: int


def _official_pdf_paths(pdf_dir: Path) -> list[Path]:
    paths = sorted(pdf_dir.glob("*.pdf"))
    if not paths:
        raise FAQPDFLinkValidationError(
            f"검증할 PDF 파일이 없습니다: {pdf_dir}"
        )

    unverified_paths = [
        path.name
        for path in paths
        if not source_for_pdf(path).provenance_verified
    ]
    if unverified_paths:
        raise FAQPDFLinkValidationError(
            "검증된 공식 PDF가 아닌 파일이 포함되어 있습니다: "
            f"{', '.join(unverified_paths)}"
        )
    return paths


def validate_faq_pdf_links(
    *,
    knowledge_base_path: Path = PROJECT_ROOT / "app/data/tax_faq.json",
    pdf_dir: Path = PROJECT_ROOT / "app/data/pdfs",
) -> FAQPDFLinkValidationResult:
    """FAQ의 source_chunk_ids가 기본 PDF 청킹 결과에 모두 존재하는지 검증한다."""
    report = load_knowledge_base(knowledge_base_path, strict_provenance=True)
    faq_documents = [
        document
        for document in report.documents
        if document.document_id.startswith("faq_")
    ]
    unmapped_faq_ids = [
        document.document_id
        for document in faq_documents
        if not document.source_chunk_ids
    ]
    if unmapped_faq_ids:
        raise FAQPDFLinkValidationError(
            "source_chunk_ids가 비어 있는 FAQ가 있습니다: "
            f"{', '.join(unmapped_faq_ids)}"
        )

    available_ids: set[str] = set()
    source_ids: set[str] = set()
    for pdf_path in _official_pdf_paths(pdf_dir):
        source = source_for_pdf(pdf_path)
        source_ids.add(source.source_id)
        available_ids.update(
            document.document_id
            for document in build_pdf_documents(
                pdf_path,
                chunk_size=600,
                overlap=100,
                source=source,
            )
        )

    linked_ids = {
        chunk_id
        for document in faq_documents
        for chunk_id in document.source_chunk_ids.split(",")
    }
    missing_ids = sorted(linked_ids.difference(available_ids))
    if missing_ids:
        raise FAQPDFLinkValidationError(
            "PDF 인덱싱 결과에 없는 source_chunk_ids가 있습니다: "
            f"{', '.join(missing_ids)}"
        )

    return FAQPDFLinkValidationResult(
        faq_count=len(faq_documents),
        chunk_link_count=len(linked_ids),
        source_count=len(source_ids),
    )


def main(argv: Sequence[str] | None = None) -> int:
    if argv:
        print("이 스크립트는 인자를 받지 않습니다.", file=sys.stderr)
        return 2
    try:
        result = validate_faq_pdf_links()
    except (OSError, ValueError) as exc:
        print(f"FAQ PDF 링크 검증 실패: {exc}", file=sys.stderr)
        return 1

    print(
        "FAQ PDF 링크 검증 완료: "
        f"FAQ {result.faq_count}개, "
        f"고유 청크 링크 {result.chunk_link_count}개, "
        f"공식 PDF 출처 {result.source_count}개"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
