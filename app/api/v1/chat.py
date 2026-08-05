from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.chat_history_service import ChatHistoryService
from app.services.rag_service import RAGService

router = APIRouter()
rag_service = RAGService()


class ChatQueryRequest(BaseModel):
    question: str = Field(..., description="유저의 연금/절세 관련 질문", example="연금저축이랑 IRP 차이가 뭐야?")
    session_id: Optional[str] = Field("default_session", description="세션/사용자 식별자 ID", example="user_123")


class ChatQueryResponse(BaseModel):
    success: bool = True
    answer: str = Field(..., description="RAG AI 챗봇의 최종 답변")
    sources: List[Dict[str, Any]] = Field(default_factory=list, description="참조한 FAQ 출처 문서 목록")


def _to_dict(obj: Any) -> Dict[str, Any]:
    """어떤 형태의 객체(Pydantic, dataclass, 일반 객체, dict)든 dict로 안전 변환"""
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "model_dump"):  # Pydantic v2
        return obj.model_dump()
    if hasattr(obj, "dict"):        # Pydantic v1
        return obj.dict()
    if is_dataclass(obj):
        return asdict(obj)
    if hasattr(obj, "__dict__"):
        return {k: v for k, v in obj.__dict__.items() if not k.startswith("_")}
    return str(obj)


@router.post("/chat/query", response_model=ChatQueryResponse)
def query_chat(request: ChatQueryRequest, db: Session = Depends(get_db)):
    try:
        session_id = request.session_id or "default_session"

        # 1. 사용자 질문 DB 저장 (PII 사전 마스킹 자동 적용)
        ChatHistoryService.save_message(
            db=db,
            session_id=session_id,
            role="user",
            message=request.question
        )

        # 최근 대화 내역 조회 (최대 6건)
        chat_history = ChatHistoryService.get_history(db, session_id, limit=6)

        # 2. RAG 서비스를 통한 질문 답변 생성
        result = rag_service.answer_question(request.question, chat_history=chat_history)
        
        # 속성값 읽기 (answer, sources)
        raw_answer = getattr(result, "answer", "")
        raw_sources = getattr(result, "sources", [])

        # result가 dict일 경우 처리
        if isinstance(result, dict):
            raw_answer = result.get("answer", "")
            raw_sources = result.get("sources", [])

        # sources 내부 element들을 dict로 강제 변환
        formatted_sources = [_to_dict(s) for s in raw_sources]
        final_answer = str(raw_answer)

        # 3. AI 답변 DB 저장
        ChatHistoryService.save_message(
            db=db,
            session_id=session_id,
            role="assistant",
            message=final_answer
        )

        return ChatQueryResponse(
            success=True,
            answer=final_answer,
            sources=formatted_sources
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"챗봇 응답 생성 중 오류 발생: {str(e)}")


@router.get("/chat/history/{session_id}")
def get_chat_history(session_id: str, db: Session = Depends(get_db)):
    """
    특정 세션 ID의 이전 대화 내역을 최신순으로 조회하는 API
    """
    history = ChatHistoryService.get_history(db, session_id)
    return {
        "success": True,
        "session_id": session_id,
        "history": history
    }

@router.get("/chat/sessions")
def get_chat_sessions(db: Session = Depends(get_db)):
    """
    저장된 채팅 세션 목록 조회 API
    """
    sessions = ChatHistoryService.get_sessions(db, limit=50)
    return {
        "success": True,
        "sessions": sessions
    }