from __future__ import annotations

from typing import Any

import chromadb

from app.core.config import RAGSettings


class VectorStoreConfigurationError(RuntimeError):
    """저장된 컬렉션과 현재 임베딩 설정이 호환되지 않을 때 발생하는 예외."""


def create_chroma_client(settings: RAGSettings) -> Any:
    settings.chroma_persist_dir.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=settings.chroma_persist_dir)


def get_vector_collection(
    settings: RAGSettings,
    *,
    client: Any | None = None,
) -> Any:
    chroma_client = client or create_chroma_client(settings)
    expected_metadata = {
        "embedding_model": settings.openai_embedding_model,
        "distance_metric": "cosine",
        "knowledge_base": str(settings.knowledge_base_path),
    }
    collection = chroma_client.get_or_create_collection(
        name=settings.chroma_collection_name,
        metadata=expected_metadata,
        embedding_function=None,
        configuration={"hnsw": {"space": "cosine"}},
    )

    actual_metadata = collection.metadata or {}
    actual_model = actual_metadata.get("embedding_model")
    actual_metric = actual_metadata.get("distance_metric")
    if (
        actual_model != settings.openai_embedding_model
        or actual_metric != "cosine"
    ):
        raise VectorStoreConfigurationError(
            "기존 ChromaDB 컬렉션의 임베딩 모델 또는 거리 기준이 "
            "현재 설정과 다릅니다. "
            "별도 컬렉션 이름을 사용하거나 생성된 Vector DB를 다시 구축하세요."
        )
    return collection
