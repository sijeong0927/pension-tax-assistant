from __future__ import annotations

import argparse
import hashlib
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

# Add project root to sys.path.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    import fitz  # PyMuPDF
except ModuleNotFoundError:  # pragma: no cover - exercised by the CLI only
    fitz = None

from app.services.rag_service import (
    RAGService,
    RAGServiceError,
)


@dataclass(frozen=True)
class PDFSource:
    source_id: str
    sha256: str
    source_title: str
    source_url: str
    effective_date: str
    last_verified: str
    provenance_verified: bool


@dataclass(frozen=True)
class PDFDocument:
    document_id: str
    text: str
    metadata: dict[str, str | bool]


@dataclass(frozen=True)
class CollectionSnapshot:
    ids: list[str]
    documents: list[str]
    metadatas: list[dict[str, Any]]
    embeddings: list[list[float]]


OFFICIAL_PDF_SOURCES: tuple[PDFSource, ...] = (
    PDFSource(
        source_id="law-2026-income-tax-act",
        sha256=(
            "8e4753899fb16bac81c9769d0f61382a36d81e67742d3a675e6516187086766a"
        ),
        source_title="소득세법",
        source_url="https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=280405",
        effective_date="2026-07-01",
        last_verified="2026-08-06",
        provenance_verified=True,
    ),
    PDFSource(
        source_id="law-2026-income-tax-decree",
        sha256=(
            "5cb1bfedb67bcc8c36a97ce042f22d3707a621f8415ebcd273edca73bb4c6e30"
        ),
        source_title="소득세법 시행령",
        source_url="https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=286211",
        effective_date="2026-07-01",
        last_verified="2026-08-06",
        provenance_verified=True,
    ),
    PDFSource(
        source_id="law-2026-special-tax-treatment-act",
        sha256=(
            "9fba29bf8f3f90da8f1227f0a54cf8885c4aa5eb28f64c45b83b3cf83a6b4ad6"
        ),
        source_title="조세특례제한법",
        source_url="https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=280409",
        effective_date="2026-07-01",
        last_verified="2026-08-06",
        provenance_verified=True,
    ),
    PDFSource(
        source_id="fsc-2025-pension-savings-white-paper",
        sha256=(
            "6a601976261ead6702c9d44a03f0ac76a64c4a687cb90767fc3ab68f6240b8ff"
        ),
        source_title="2025년 우리나라 연금저축(PSA) 투자 백서",
        source_url="https://www.fsc.go.kr/po010103/87144",
        effective_date="2026-06-18",
        last_verified="2026-08-06",
        provenance_verified=True,
    ),
    PDFSource(
        source_id="fsc-2018-retirement-pension-risk-assets",
        sha256=(
            "d1de6bd7f78c4357e7c8e70a57bf96452abb0dca919f5dc4fdec4b69c0b0a74e"
        ),
        source_title="퇴직연금감독규정 개정안 금융위 의결",
        source_url="https://www.fsc.go.kr/po010103/73294",
        effective_date="2018-08-31",
        last_verified="2026-08-06",
        provenance_verified=True,
    ),
    PDFSource(
        source_id="law-2026-retirement-benefits-act",
        sha256=(
            "86f057e14319fbd81a54c22a7c7fd5e473a24eb6226bb2118c365def033ad5ac"
        ),
        source_title="근로자퇴직급여 보장법",
        source_url="https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=284455",
        effective_date="2026-07-01",
        last_verified="2026-08-06",
        provenance_verified=True,
    ),
    PDFSource(
        source_id="nts-2025-year-end-tax-guide",
        sha256=(
            "54a1d1c4159682830a2242dbd1a4ac7d6fccc69898372d12e96374d7d755c182"
        ),
        source_title="2025년 원천징수의무자를 위한 연말정산 신고안내",
        source_url=(
            "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?"
            "cntntsId=238938&mi=2304"
        ),
        effective_date="2025-01-01",
        last_verified="2026-08-04",
        provenance_verified=True,
    ),
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Parse a PDF and index verified chunks in ChromaDB.",
    )
    parser.add_argument(
        "--pdf",
        type=Path,
        default=PROJECT_ROOT / "app/data/pdfs/2025_year_end_tax_guide.pdf",
        help="PDF path to index.",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=600,
        help="Chunk length in characters (default: 600).",
    )
    parser.add_argument(
        "--overlap",
        type=int,
        default=100,
        help="Character overlap between chunks (default: 100).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=40,
        help="Embedding batch size (default: 40).",
    )
    return parser


def parse_arguments(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.chunk_size <= 0:
        parser.error("--chunk-size must be greater than zero")
    if not 0 <= args.overlap < args.chunk_size:
        parser.error("--overlap must be zero or greater and smaller than --chunk-size")
    if args.batch_size <= 0:
        parser.error("--batch-size must be greater than zero")
    return args


def chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    """Split normalized text without allowing a non-progressing chunk loop."""
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than zero")
    if not 0 <= overlap < chunk_size:
        raise ValueError("overlap must be zero or greater and smaller than chunk_size")

    normalized_text = " ".join(text.split())
    if not normalized_text:
        return []

    chunks: list[str] = []
    step = chunk_size - overlap
    for start in range(0, len(normalized_text), step):
        chunk = normalized_text[start : start + chunk_size]
        if not chunk:
            break
        chunks.append(chunk)
        if start + chunk_size >= len(normalized_text):
            break
    return chunks


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source_file:
        for block in iter(lambda: source_file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _local_source_id(path: Path) -> str:
    # The source ID is stable for repeated runs against the same path, but the
    # path itself is never stored in Chroma metadata.
    resolved_path = str(path.resolve()).replace("\\", "/")
    return "local-" + hashlib.sha256(resolved_path.encode("utf-8")).hexdigest()[:16]


def source_for_pdf(path: Path) -> PDFSource:
    sha256 = _file_sha256(path)
    for source in OFFICIAL_PDF_SOURCES:
        if sha256 == source.sha256:
            return source
    return PDFSource(
        source_id=_local_source_id(path),
        sha256=sha256,
        source_title=path.name,
        source_url="",
        effective_date="",
        last_verified="",
        provenance_verified=False,
    )


def _pdf_document_id(source: PDFSource, page_number: int, chunk_number: int) -> str:
    return (
        f"pdf_{source.source_id}_{source.sha256[:16]}_"
        f"page_{page_number:03d}_chunk_{chunk_number:03d}"
    )


def build_pdf_documents(
    pdf_path: Path,
    *,
    chunk_size: int,
    overlap: int,
    source: PDFSource,
) -> list[PDFDocument]:
    if fitz is None or not hasattr(fitz, "open"):
        raise RAGServiceError(
            "PyMuPDF is required for PDF indexing. Install dependencies from "
            "requirements.txt first."
        )
    documents: list[PDFDocument] = []
    try:
        pdf = fitz.open(pdf_path)
    except Exception as exc:
        raise RAGServiceError(f"Unable to open PDF: {pdf_path}") from exc

    try:
        for page_index, page in enumerate(pdf):
            page_number = page_index + 1
            for chunk_number, chunk in enumerate(
                chunk_text(page.get_text("text"), chunk_size, overlap),
                start=1,
            ):
                document_id = _pdf_document_id(source, page_number, chunk_number)
                documents.append(
                    PDFDocument(
                        document_id=document_id,
                        text=(
                            f"[{source.source_title} - page {page_number}]\n"
                            f"{chunk}"
                        ),
                        metadata={
                            "title": (
                                f"{source.source_title} {page_number}페이지 "
                                f"(조각 {chunk_number})"
                            ),
                            "category": "연말정산 신고안내",
                            "dataset_updated_at": source.last_verified,
                            "source_id": source.source_id,
                            "source_sha256": source.sha256,
                            "source_title": source.source_title,
                            "source_url": source.source_url,
                            "effective_date": source.effective_date,
                            "last_verified": source.last_verified,
                            "provenance_verified": source.provenance_verified,
                        },
                    )
                )
    finally:
        pdf.close()

    if not documents:
        raise RAGServiceError("PDF did not contain indexable text")
    return documents


def _index_limit(rag_service: RAGService) -> int:
    return rag_service.settings.rag_max_pdf_documents


def _existing_source_ids(collection: Any, source_id: str) -> set[str]:
    try:
        result = collection.get(where={"source_id": source_id}, include=[])
    except Exception as exc:
        raise RAGServiceError("Unable to inspect existing PDF chunks") from exc
    return {str(document_id) for document_id in result.get("ids") or []}


def _legacy_pdf_ids(collection: Any, source: PDFSource) -> set[str]:
    if source.source_id != "nts-2025-year-end-tax-guide":
        return set()
    try:
        result = collection.get(include=[])
    except Exception as exc:
        raise RAGServiceError("Unable to inspect legacy PDF chunks") from exc
    return {
        str(document_id)
        for document_id in result.get("ids") or []
        if str(document_id).startswith("pdf_page_")
    }


def _snapshot_documents(
    collection: Any,
    document_ids: Sequence[str],
) -> CollectionSnapshot:
    if not document_ids:
        return CollectionSnapshot([], [], [], [])
    try:
        result = collection.get(
            ids=list(document_ids),
            include=["documents", "metadatas", "embeddings"],
        )
        ids = [str(document_id) for document_id in result.get("ids") or []]
        documents = [str(document) for document in result.get("documents") or []]
        metadatas = [dict(metadata or {}) for metadata in result.get("metadatas") or []]
        embeddings = [list(embedding) for embedding in result.get("embeddings") or []]
    except Exception as exc:
        raise RAGServiceError("Unable to snapshot existing PDF chunks") from exc
    if not (
        len(ids) == len(documents) == len(metadatas) == len(embeddings)
    ):
        raise RAGServiceError("Existing PDF chunk snapshot was incomplete")
    return CollectionSnapshot(ids, documents, metadatas, embeddings)


def _best_effort_delete(collection: Any, document_ids: Sequence[str]) -> None:
    if not document_ids:
        return
    try:
        collection.delete(ids=list(document_ids))
    except Exception:
        # This is a rollback attempt after a failed write. Keep the original
        # error as the actionable exception when Chroma is unavailable.
        pass


def _best_effort_restore(
    collection: Any,
    snapshot: CollectionSnapshot,
) -> None:
    if not snapshot.ids:
        return
    try:
        collection.upsert(
            ids=snapshot.ids,
            documents=snapshot.documents,
            metadatas=snapshot.metadatas,
            embeddings=snapshot.embeddings,
        )
    except Exception:
        # This is a rollback attempt after a failed write. Keep the original
        # error as the actionable exception when Chroma is unavailable.
        pass


def index_pdf_documents(
    documents: Sequence[PDFDocument],
    *,
    source: PDFSource,
    rag_service: RAGService,
    batch_size: int,
) -> int:
    if batch_size <= 0:
        raise ValueError("batch_size must be greater than zero")
    index_limit = _index_limit(rag_service)
    if len(documents) > index_limit:
        raise RAGServiceError(
            "PDF has "
            f"{len(documents)} chunks, exceeding the configured index limit "
            f"of {index_limit}. No embedding API call was made."
        )
    request_count = math.ceil(len(documents) / batch_size)
    request_limit = rag_service.settings.rag_max_pdf_embedding_requests
    if request_count > request_limit:
        raise RAGServiceError(
            "PDF indexing would require "
            f"{request_count} embedding requests, exceeding the configured "
            f"limit of {request_limit}. No embedding API call was made."
        )

    collection = rag_service._get_collection()
    existing_ids = _existing_source_ids(collection, source.source_id)
    existing_ids.update(_legacy_pdf_ids(collection, source))
    existing_snapshot = _snapshot_documents(collection, sorted(existing_ids))

    embeddings: list[list[float]] = []
    for start in range(0, len(documents), batch_size):
        batch = documents[start : start + batch_size]
        embeddings.extend(rag_service._embed([document.text for document in batch]))
    if len(embeddings) != len(documents):
        raise RAGServiceError("Embedding response count did not match PDF chunk count")

    new_ids = [document.document_id for document in documents]
    new_only_ids = sorted(set(new_ids).difference(existing_ids))
    stale_ids = sorted(existing_ids.difference(new_ids))
    try:
        # All embedding calls have completed before the first mutation. A
        # single upsert prevents an API failure mid-index from replacing only
        # part of the prior source version.
        collection.upsert(
            ids=new_ids,
            documents=[document.text for document in documents],
            metadatas=[document.metadata for document in documents],
            embeddings=embeddings,
        )
    except Exception as exc:
        _best_effort_delete(collection, new_only_ids)
        _best_effort_restore(collection, existing_snapshot)
        raise RAGServiceError("Unable to stage new PDF chunks in ChromaDB") from exc

    try:
        if stale_ids:
            collection.delete(ids=stale_ids)
    except Exception as exc:
        _best_effort_delete(collection, new_only_ids)
        _best_effort_restore(collection, existing_snapshot)
        raise RAGServiceError(
            "Unable to replace the previous PDF source version; the new "
            "version was rolled back."
        ) from exc
    return len(documents)


def index_pdf(
    pdf_path: Path,
    *,
    chunk_size: int,
    overlap: int,
    batch_size: int,
    rag_service: RAGService | None = None,
) -> tuple[int, PDFSource]:
    source = source_for_pdf(pdf_path)
    documents = build_pdf_documents(
        pdf_path,
        chunk_size=chunk_size,
        overlap=overlap,
        source=source,
    )
    indexed_count = index_pdf_documents(
        documents,
        source=source,
        rag_service=rag_service or RAGService(),
        batch_size=batch_size,
    )
    return indexed_count, source


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_arguments(argv)
    pdf_path = args.pdf.resolve()
    if not pdf_path.is_file():
        print(f"PDF file was not found: {pdf_path}", file=sys.stderr)
        return 1

    try:
        indexed_count, source = index_pdf(
            pdf_path,
            chunk_size=args.chunk_size,
            overlap=args.overlap,
            batch_size=args.batch_size,
        )
    except (OSError, RAGServiceError, ValueError) as exc:
        print(f"PDF indexing failed: {exc}", file=sys.stderr)
        return 1

    verification = "verified" if source.provenance_verified else "unverified"
    print(
        f"Indexed {indexed_count} chunks from {pdf_path.name} "
        f"({verification} source, SHA-256 {source.sha256})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
