from __future__ import annotations

import logging
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.config import ConfigurationError, get_rag_settings
from app.core.rate_limit import ChatRateLimitExceeded, ChatRateLimiter
from app.core.vector_db import VectorStoreConfigurationError
from app.models.chat import (
    ChatErrorResponse,
    ChatQueryRequest,
    ChatQueryResponse,
)
from app.models.rag import RAGAnswer
from app.services.rag_service import (
    KnowledgeBaseNotIndexedError,
    RAGService,
    RAGServiceError,
)


logger = logging.getLogger(__name__)
_dependency_lock = Lock()
_rag_service_instance: RAGService | None = None
_rate_limiter_instance: ChatRateLimiter | None = None

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

CHAT_NOT_READY_MESSAGE = (
    "챗봇 준비가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요."
)
CHAT_UNAVAILABLE_MESSAGE = (
    "챗봇 응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."
)
CHAT_INTERNAL_ERROR_MESSAGE = (
    "챗봇 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
)


def _log_safe_error(message: str, exc: BaseException) -> None:
    logger.error("%s 예외 유형=%s", message, type(exc).__name__)


def _chat_error(
    *,
    status_code: int,
    code: str,
    message: str,
    headers: dict[str, str] | None = None,
) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
        headers=headers,
    )


def get_rag_service() -> RAGService:
    try:
        return _get_cached_rag_service()
    except ConfigurationError as exc:
        _log_safe_error("RAG 서비스 설정을 읽지 못했습니다.", exc)
        raise _chat_error(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="chat_not_ready",
            message=CHAT_NOT_READY_MESSAGE,
        ) from exc


def _get_cached_rag_service() -> RAGService:
    global _rag_service_instance
    if _rag_service_instance is None:
        with _dependency_lock:
            if _rag_service_instance is None:
                _rag_service_instance = RAGService()
    return _rag_service_instance


def _get_cached_rate_limiter() -> ChatRateLimiter:
    global _rate_limiter_instance
    if _rate_limiter_instance is None:
        with _dependency_lock:
            if _rate_limiter_instance is None:
                settings = get_rag_settings()
                _rate_limiter_instance = ChatRateLimiter(
                    requests_per_minute=settings.chat_requests_per_minute,
                    requests_per_day=settings.chat_requests_per_day,
                )
    return _rate_limiter_instance


def get_chat_rate_limiter() -> ChatRateLimiter:
    try:
        return _get_cached_rate_limiter()
    except (ConfigurationError, ValueError) as exc:
        _log_safe_error("챗봇 호출 제한 설정을 읽지 못했습니다.", exc)
        raise _chat_error(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="chat_not_ready",
            message=CHAT_NOT_READY_MESSAGE,
        ) from exc


@router.post(
    "/query",
    response_model=ChatQueryResponse,
    summary="RAG 기반 연금 세법 질문 답변",
    responses={
        status.HTTP_429_TOO_MANY_REQUESTS: {"model": ChatErrorResponse},
        status.HTTP_500_INTERNAL_SERVER_ERROR: {"model": ChatErrorResponse},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ChatErrorResponse},
    },
)
def query_chat(
    payload: ChatQueryRequest,
    request: Request,
    service: RAGService = Depends(get_rag_service),
    rate_limiter: ChatRateLimiter = Depends(get_chat_rate_limiter),
) -> RAGAnswer:
    client_key = request.client.host if request.client else "unknown"
    try:
        rate_limiter.check(client_key)
    except ChatRateLimitExceeded as exc:
        code = (
            "chat_daily_limit_exceeded"
            if exc.reason == "daily"
            else "chat_rate_limit_exceeded"
        )
        raise _chat_error(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            code=code,
            message=(
                "챗봇 호출 한도를 초과했습니다. "
                "잠시 후 다시 시도해 주세요."
            ),
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    except Exception as exc:
        _log_safe_error("챗봇 호출 제한을 확인하지 못했습니다.", exc)
        raise _chat_error(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="chat_not_ready",
            message=CHAT_NOT_READY_MESSAGE,
        ) from exc

    try:
        return service.answer_question(
            payload.question,
            history=payload.history,
        )
    except ConfigurationError as exc:
        _log_safe_error("RAG 서비스 설정 오류가 발생했습니다.", exc)
        raise _chat_error(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="chat_not_ready",
            message=CHAT_NOT_READY_MESSAGE,
        ) from exc
    except (
        KnowledgeBaseNotIndexedError,
        VectorStoreConfigurationError,
    ) as exc:
        _log_safe_error("RAG 지식베이스를 사용할 수 없습니다.", exc)
        raise _chat_error(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="chat_not_ready",
            message=CHAT_NOT_READY_MESSAGE,
        ) from exc
    except RAGServiceError as exc:
        _log_safe_error(
            "RAG 답변 생성 중 일시적인 오류가 발생했습니다.",
            exc,
        )
        raise _chat_error(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="chat_unavailable",
            message=CHAT_UNAVAILABLE_MESSAGE,
        ) from exc
    except Exception as exc:
        _log_safe_error("처리되지 않은 챗봇 API 오류가 발생했습니다.", exc)
        raise _chat_error(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code="chat_internal_error",
            message=CHAT_INTERNAL_ERROR_MESSAGE,
        ) from exc
