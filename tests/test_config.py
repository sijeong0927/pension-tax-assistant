from __future__ import annotations

import pytest

from app.core.config import ConfigurationError, RAGSettings


@pytest.mark.parametrize("value", ["nan", "inf", "-inf", "0", "-1"])
def test_openai_timeout_must_be_finite_and_positive(
    monkeypatch: pytest.MonkeyPatch,
    value: str,
) -> None:
    monkeypatch.setenv("OPENAI_TIMEOUT_SECONDS", value)

    with pytest.raises(ConfigurationError, match="유한한 양수"):
        RAGSettings.from_env()


@pytest.mark.parametrize(
    "name",
    [
        "OPENAI_CHAT_MODEL",
        "OPENAI_EMBEDDING_MODEL",
        "CHROMA_COLLECTION_NAME",
        "KNOWLEDGE_BASE_PATH",
    ],
)
def test_required_string_settings_reject_whitespace(
    monkeypatch: pytest.MonkeyPatch,
    name: str,
) -> None:
    monkeypatch.setenv(name, "   ")

    with pytest.raises(ConfigurationError, match="비어 있을 수 없습니다"):
        RAGSettings.from_env()


def test_openai_api_key_is_trimmed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "  test-key  ")

    settings = RAGSettings.from_env()

    assert settings.openai_api_key == "test-key"
