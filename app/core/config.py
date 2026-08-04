from __future__ import annotations

import math
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
    if not math.isfinite(value) or value <= 0:
        raise ConfigurationError(f"{name}은 유한한 양수여야 합니다.")
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
    raw_value = os.getenv(name, default).strip()
    if not raw_value:
        raise ConfigurationError(f"{name}은 비어 있을 수 없습니다.")
    value = Path(raw_value).expanduser()
    if not value.is_absolute():
        value = PROJECT_ROOT / value
    return value.resolve()


def _non_empty_string(name: str, default: str) -> str:
    value = os.getenv(name, default).strip()
    if not value:
        raise ConfigurationError(f"{name}은 비어 있을 수 없습니다.")
    return value


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
    rag_min_relevance_score: float
    rag_max_index_documents: int
    chat_requests_per_minute: int = 5
    chat_requests_per_day: int = 100

    @classmethod
    def from_env(cls) -> "RAGSettings":
        raw_api_key = os.getenv("OPENAI_API_KEY", "").strip()
        return cls(
            openai_api_key=raw_api_key or None,
            openai_chat_model=_non_empty_string(
                "OPENAI_CHAT_MODEL",
                "gpt-4o-mini",
            ),
            openai_embedding_model=_non_empty_string(
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
            chroma_collection_name=_non_empty_string(
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
            rag_min_relevance_score=_score(
                "RAG_MIN_RELEVANCE_SCORE",
                0.35,
            ),
            rag_max_index_documents=_bounded_int(
                "RAG_MAX_INDEX_DOCUMENTS",
                50,
                minimum=1,
                maximum=100,
            ),
            chat_requests_per_minute=_bounded_int(
                "CHAT_REQUESTS_PER_MINUTE",
                5,
                minimum=1,
                maximum=60,
            ),
            chat_requests_per_day=_bounded_int(
                "CHAT_REQUESTS_PER_DAY",
                100,
                minimum=1,
                maximum=10_000,
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
