from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.services.rag_service import RAGServiceError
from scripts import index_pdf


class FakeCollection:
    def __init__(self) -> None:
        self.records: dict[str, dict[str, Any]] = {}
        self.fail_delete_ids: set[str] = set()
        self.fail_upsert = False

    def get(self, **kwargs: Any) -> dict[str, list[Any]]:
        where = kwargs.get("where")
        requested_ids = kwargs.get("ids")
        if requested_ids is not None:
            document_ids = [
                document_id
                for document_id in requested_ids
                if document_id in self.records
            ]
        elif where is not None:
            document_ids = [
                document_id
                for document_id, record in self.records.items()
                if record["metadata"].get("source_id") == where["source_id"]
            ]
        else:
            document_ids = list(self.records)
        return {
            "ids": document_ids,
            "documents": [self.records[document_id]["document"] for document_id in document_ids],
            "metadatas": [self.records[document_id]["metadata"] for document_id in document_ids],
            "embeddings": [self.records[document_id]["embedding"] for document_id in document_ids],
        }

    def upsert(self, **kwargs: Any) -> None:
        if self.fail_upsert:
            raise RuntimeError("upsert failed")
        for document_id, document, metadata, embedding in zip(
            kwargs["ids"],
            kwargs["documents"],
            kwargs["metadatas"],
            kwargs["embeddings"],
        ):
            self.records[document_id] = {
                "document": document,
                "metadata": metadata,
                "embedding": embedding,
            }

    def delete(self, *, ids: list[str]) -> None:
        if self.fail_delete_ids.intersection(ids):
            raise RuntimeError("delete failed")
        for document_id in ids:
            self.records.pop(document_id, None)


class FakeRAGService:
    def __init__(
        self,
        collection: FakeCollection,
        *,
        limit: int = 10,
        request_limit: int = 10,
    ) -> None:
        self.collection = collection
        self.settings = SimpleNamespace(
            rag_max_pdf_documents=limit,
            rag_max_pdf_embedding_requests=request_limit,
        )
        self.embedding_calls: list[list[str]] = []

    def _get_collection(self) -> FakeCollection:
        return self.collection

    def _embed(self, texts: list[str]) -> list[list[float]]:
        self.embedding_calls.append(texts)
        return [[float(index)] for index, _ in enumerate(texts)]


def make_source(*, sha256: str = "a" * 64) -> index_pdf.PDFSource:
    return index_pdf.PDFSource(
        source_id="test-source",
        sha256=sha256,
        source_title="Test source",
        source_url="https://example.test/source.pdf",
        effective_date="2025-01-01",
        last_verified="2026-08-04",
        provenance_verified=True,
    )


def make_document(
    document_id: str,
    *,
    source_id: str = "test-source",
) -> index_pdf.PDFDocument:
    return index_pdf.PDFDocument(
        document_id=document_id,
        text=document_id,
        metadata={"source_id": source_id, "provenance_verified": True},
    )


@pytest.mark.parametrize(
    ("chunk_size", "overlap"),
    [(0, 0), (10, -1), (10, 10), (10, 11)],
)
def test_chunk_text_rejects_invalid_boundaries(
    chunk_size: int,
    overlap: int,
) -> None:
    with pytest.raises(ValueError):
        index_pdf.chunk_text("text", chunk_size, overlap)


@pytest.mark.parametrize(
    "arguments",
    [
        ["--chunk-size", "0"],
        ["--chunk-size", "10", "--overlap", "10"],
        ["--chunk-size", "10", "--overlap", "-1"],
        ["--batch-size", "0"],
        ["--batch-size", "-1"],
    ],
)
def test_cli_rejects_invalid_numeric_arguments(arguments: list[str]) -> None:
    with pytest.raises(SystemExit) as exc_info:
        index_pdf.parse_arguments(arguments)

    assert exc_info.value.code == 2


def test_source_for_an_unapproved_pdf_is_not_verified(tmp_path: Path) -> None:
    pdf_path = tmp_path / "uploaded.pdf"
    pdf_path.write_bytes(b"not an approved NTS document")

    source = index_pdf.source_for_pdf(pdf_path)

    assert source.provenance_verified is False
    assert source.source_url == ""
    assert source.source_id.startswith("local-")


def test_build_pdf_documents_parses_pages_and_namespaces_ids(tmp_path: Path) -> None:
    fitz = pytest.importorskip("fitz")
    pdf_path = tmp_path / "sample.pdf"
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_text((72, 72), "Pension tax source document")
    pdf.save(pdf_path)
    pdf.close()

    source = make_source()
    documents = index_pdf.build_pdf_documents(
        pdf_path,
        chunk_size=10,
        overlap=2,
        source=source,
    )

    assert len(documents) >= 2
    assert all(document.document_id.startswith("pdf_test-source_aaaaaaaaaaaaaaaa_page_001") for document in documents)
    assert all(document.metadata["source_sha256"] == "a" * 64 for document in documents)


def test_index_limit_prevents_any_embedding_call() -> None:
    collection = FakeCollection()
    service = FakeRAGService(collection, limit=2)

    with pytest.raises(RAGServiceError, match="No embedding API call"):
        index_pdf.index_pdf_documents(
            [make_document("one"), make_document("two"), make_document("three")],
            source=make_source(),
            rag_service=service,  # type: ignore[arg-type]
            batch_size=2,
        )

    assert service.embedding_calls == []
    assert collection.records == {}


def test_embedding_request_limit_prevents_any_embedding_call() -> None:
    collection = FakeCollection()
    service = FakeRAGService(collection, limit=10, request_limit=1)

    with pytest.raises(RAGServiceError, match="embedding requests"):
        index_pdf.index_pdf_documents(
            [make_document("one"), make_document("two")],
            source=make_source(),
            rag_service=service,  # type: ignore[arg-type]
            batch_size=1,
        )

    assert service.embedding_calls == []
    assert collection.records == {}


def test_reindex_replaces_stale_chunks_after_embeddings_succeed() -> None:
    collection = FakeCollection()
    collection.records["old"] = {
        "document": "old",
        "metadata": {"source_id": "test-source"},
        "embedding": [0.0],
    }
    service = FakeRAGService(collection)

    indexed_count = index_pdf.index_pdf_documents(
        [make_document("new")],
        source=make_source(sha256="b" * 64),
        rag_service=service,  # type: ignore[arg-type]
        batch_size=1,
    )

    assert indexed_count == 1
    assert service.embedding_calls == [["new"]]
    assert set(collection.records) == {"new"}


def test_failed_stale_cleanup_rolls_back_new_chunks() -> None:
    collection = FakeCollection()
    collection.records["old"] = {
        "document": "old",
        "metadata": {"source_id": "test-source"},
        "embedding": [0.0],
    }
    collection.fail_delete_ids.add("old")
    service = FakeRAGService(collection)

    with pytest.raises(RAGServiceError, match="rolled back"):
        index_pdf.index_pdf_documents(
            [make_document("new")],
            source=make_source(sha256="b" * 64),
            rag_service=service,  # type: ignore[arg-type]
            batch_size=1,
        )

    assert set(collection.records) == {"old"}


def test_failed_upsert_restores_an_existing_source_version() -> None:
    collection = FakeCollection()
    collection.records["current"] = {
        "document": "current",
        "metadata": {"source_id": "test-source"},
        "embedding": [0.0],
    }
    collection.fail_upsert = True
    service = FakeRAGService(collection)

    with pytest.raises(RAGServiceError, match="stage new PDF chunks"):
        index_pdf.index_pdf_documents(
            [make_document("current")],
            source=make_source(),
            rag_service=service,  # type: ignore[arg-type]
            batch_size=1,
        )

    assert collection.records["current"]["document"] == "current"
