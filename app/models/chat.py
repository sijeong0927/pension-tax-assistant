from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.rag import RAGAnswer


MAX_QUESTION_LENGTH = 2_000
MAX_HISTORY_MESSAGES = 8
MAX_HISTORY_MESSAGE_LENGTH = 1_000
MAX_HISTORY_TOTAL_LENGTH = 4_000

SENSITIVE_INFORMATION_PATTERNS = (
    re.compile(r"(?<!\d)\d{6}[- ]?[1-8]\d{6}(?!\d)"),
    re.compile(
        r"(?:주민등록|주민|계좌|카드)\s*(?:번호)?\s*[:：-]?\s*"
        r"(?:\d[ -]?){8,19}",
        re.IGNORECASE,
    ),
    re.compile(r"(?<!\d)(?:\d[ -]?){12,19}(?!\d)"),
)


def _normalize_user_text(
    value: object,
    *,
    empty_message: str,
) -> object:
    if not isinstance(value, str):
        return value
    normalized = value.strip()
    if not normalized:
        raise ValueError(empty_message)
    if any(
        pattern.search(normalized)
        for pattern in SENSITIVE_INFORMATION_PATTERNS
    ):
        raise ValueError(
            "주민등록번호, 계좌번호, 카드번호 등 민감정보는 입력하지 마세요."
        )
    return normalized


class ChatMessage(BaseModel):
    """클라이언트가 후속 질문과 함께 전달하는 이전 대화 한 건."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(
        min_length=1,
        max_length=MAX_HISTORY_MESSAGE_LENGTH,
    )

    @field_validator("content", mode="before")
    @classmethod
    def normalize_content(cls, value: object) -> object:
        return _normalize_user_text(
            value,
            empty_message="대화 내용은 공백일 수 없습니다.",
        )


class ChatQueryRequest(BaseModel):
    """서버에 저장하지 않는 단일 챗봇 질의 요청."""

    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=MAX_QUESTION_LENGTH)
    history: list[ChatMessage] = Field(
        default_factory=list,
        max_length=MAX_HISTORY_MESSAGES,
    )

    @field_validator("question", mode="before")
    @classmethod
    def normalize_question(cls, value: object) -> object:
        return _normalize_user_text(
            value,
            empty_message="질문은 공백일 수 없습니다.",
        )

    @model_validator(mode="after")
    def validate_history_total_length(self) -> ChatQueryRequest:
        total_length = sum(len(message.content) for message in self.history)
        if total_length > MAX_HISTORY_TOTAL_LENGTH:
            raise ValueError(
                "대화 이력은 합계 "
                f"{MAX_HISTORY_TOTAL_LENGTH:,}자 이하로 입력해 주세요."
            )
        return self


class ChatQueryResponse(RAGAnswer):
    """근거 문서와 면책 문구를 포함한 챗봇 응답."""

    model_config = ConfigDict(extra="forbid")


class ChatErrorDetail(BaseModel):
    code: str
    message: str


class ChatErrorResponse(BaseModel):
    detail: ChatErrorDetail
