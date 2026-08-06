from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")


class ConfigurationError(ValueError):
    """환경변수 값이 올바르지 않을 때 발생하는 예외."""


def _bounded_int(
    name: str,
    default: int,
    *,
    minimum: int,
    maximum: int,
) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ConfigurationError(f"{name}은 정수여야 합니다.") from exc
    if not minimum <= value <= maximum:
        raise ConfigurationError(
            f"{name}은 {minimum} 이상 {maximum} 이하이어야 합니다."
        )
    return value


def _positive_float(name: str, default: float) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = float(raw_value)
    except ValueError as exc:
        raise ConfigurationError(f"{name}은 숫자여야 합니다.") from exc
    if value <= 0:
        raise ConfigurationError(f"{name}은 0보다 커야 합니다.")
    return value


def _score(name: str, default: float) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = float(raw_value)
    except ValueError as exc:
        raise ConfigurationError(f"{name}은 숫자여야 합니다.") from exc
    if not 0 <= value <= 1:
        raise ConfigurationError(f"{name}은 0 이상 1 이하이어야 합니다.")
    return value


def _project_path(name: str, default: str) -> Path:
    value = Path(os.getenv(name, default)).expanduser()
    if not value.is_absolute():
        value = PROJECT_ROOT / value
    return value.resolve()


@dataclass(frozen=True)
class RAGSettings:
    openai_api_key: str | None
    openai_chat_model: str
    openai_embedding_model: str
    openai_timeout_seconds: float
    openai_max_retries: int
    chroma_persist_dir: Path
    chroma_collection_name: str
    knowledge_base_path: Path
    rag_top_k: int
    rag_candidate_k: int
    rag_min_relevance_score: float
    rag_context_document_limit: int
    rag_linked_evidence_per_faq: int
    rag_max_index_documents: int
    rag_max_pdf_documents: int
    rag_max_pdf_embedding_requests: int

    @classmethod
    def from_env(cls) -> "RAGSettings":
        return cls(
            openai_api_key=os.getenv("OPENAI_API_KEY") or None,
            openai_chat_model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
            openai_embedding_model=os.getenv(
                "OPENAI_EMBEDDING_MODEL",
                "text-embedding-3-small",
            ),
            openai_timeout_seconds=_positive_float(
                "OPENAI_TIMEOUT_SECONDS",
                30.0,
            ),
            openai_max_retries=_bounded_int(
                "OPENAI_MAX_RETRIES",
                1,
                minimum=0,
                maximum=1,
            ),
            chroma_persist_dir=_project_path(
                "CHROMA_PERSIST_DIR",
                ".chroma",
            ),
            chroma_collection_name=os.getenv(
                "CHROMA_COLLECTION_NAME",
                "pension_tax_faq",
            ),
            knowledge_base_path=_project_path(
                "KNOWLEDGE_BASE_PATH",
                "app/data/tax_faq.json",
            ),
            rag_top_k=_bounded_int(
                "RAG_TOP_K",
                4,
                minimum=1,
                maximum=8,
            ),
            rag_candidate_k=_bounded_int(
                "RAG_CANDIDATE_K",
                12,
                minimum=1,
                maximum=32,
            ),
            rag_min_relevance_score=_score(
                "RAG_MIN_RELEVANCE_SCORE",
                0.35,
            ),
            rag_context_document_limit=_bounded_int(
                "RAG_CONTEXT_DOCUMENT_LIMIT",
                6,
                minimum=1,
                maximum=12,
            ),
            rag_linked_evidence_per_faq=_bounded_int(
                "RAG_LINKED_EVIDENCE_PER_FAQ",
                2,
                minimum=1,
                maximum=4,
            ),
            rag_max_index_documents=_bounded_int(
                "RAG_MAX_INDEX_DOCUMENTS",
                100,
                minimum=1,
                maximum=100,
            ),
            rag_max_pdf_documents=_bounded_int(
                "RAG_MAX_PDF_DOCUMENTS",
                1200,
                minimum=1,
                maximum=1500,
            ),
            rag_max_pdf_embedding_requests=_bounded_int(
                "RAG_MAX_PDF_EMBEDDING_REQUESTS",
                50,
                minimum=1,
                maximum=50,
            ),
        )

    def require_openai_api_key(self) -> str:
        if not self.openai_api_key:
            raise ConfigurationError(
                "OPENAI_API_KEY가 설정되지 않았습니다. "
                ".env.example을 참고해 환경변수를 설정하세요."
            )
        return self.openai_api_key


@lru_cache
def get_rag_settings() -> RAGSettings:
    return RAGSettings.from_env()
