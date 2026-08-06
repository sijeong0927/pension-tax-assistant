from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from supabase import Client
import json

from app.db.session import get_db
from app.services.chat_history_service import ChatHistoryService
from app.services.rag_service import RAGService
from app.core.security import get_current_user_optional

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
def query_chat(request: ChatQueryRequest, db: Client = Depends(get_db), current_user: Optional[dict] = Depends(get_current_user_optional)):
    try:
        session_id = request.session_id or "default_session"
        user_id = current_user.get("id") if current_user else None

        # 1. 사용자 질문 DB 저장 (PII 사전 마스킹 자동 적용)
        ChatHistoryService.save_message(
            db=db,
            session_id=session_id,
            role="user",
            message=request.question,
            user_id=user_id
        )

        # 최근 대화 내역 조회 (최대 6건)
        chat_history = ChatHistoryService.get_history(db, session_id, limit=6, user_id=user_id)

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
            message=final_answer,
            sources=formatted_sources,
            user_id=user_id
        )

        return ChatQueryResponse(
            success=True,
            answer=final_answer,
            sources=formatted_sources
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"챗봇 응답 생성 중 오류 발생: {str(e)}")

@router.post("/chat/query/stream")
def query_chat_stream(request: ChatQueryRequest, db: Client = Depends(get_db), current_user: Optional[dict] = Depends(get_current_user_optional)):
    session_id = request.session_id or "default_session"
    user_id = current_user.get("id") if current_user else None
    
    # 1. 사용자 질문 DB 저장
    ChatHistoryService.save_message(
        db=db,
        session_id=session_id,
        role="user",
        message=request.question,
        user_id=user_id
    )

    chat_history = ChatHistoryService.get_history(db, session_id, limit=6, user_id=user_id)
    
    def event_generator():
        full_answer = ""
        sources: list[dict[str, Any]] = []
        for event in rag_service.answer_question_stream(request.question, chat_history=chat_history):
            if event.startswith("event: sources"):
                try:
                    data_str = event.split("data: ", 1)[1].strip()
                    parsed_sources = json.loads(data_str)
                    if isinstance(parsed_sources, list):
                        sources = [item for item in parsed_sources if isinstance(item, dict)]
                except (IndexError, json.JSONDecodeError):
                    sources = []
            elif event.startswith("event: message"):
                try:
                    data_str = event.split("data: ", 1)[1].strip()
                    data = json.loads(data_str)
                    full_answer += data.get("content", "")
                except (IndexError, json.JSONDecodeError):
                    pass
            yield event
            
        # 3. 스트리밍 완료 후 전체 AI 답변 DB 저장
        if full_answer:
            ChatHistoryService.save_message(
                db=db,
                session_id=session_id,
                role="assistant",
                message=full_answer,
                sources=sources,
                user_id=user_id
            )
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/chat/history/{session_id}")
def get_chat_history(session_id: str, db: Client = Depends(get_db), current_user: Optional[dict] = Depends(get_current_user_optional)):
    """
    특정 세션 ID의 이전 대화 내역을 조회하는 API
    """
    user_id = current_user.get("id") if current_user else None
    history = ChatHistoryService.get_history(db, session_id, user_id=user_id)
    return {
        "success": True,
        "session_id": session_id,
        "history": [
            {
                "id": item.get("id"),
                "session_id": item.get("session_id"),
                "role": item.get("role"),
                "message": item.get("message"),
                "created_at": item.get("created_at"),
                "sources": ChatHistoryService.get_sources(item, db=db),
            }
            for item in history
        ],
    }

@router.get("/chat/sessions")
def get_chat_sessions(db: Client = Depends(get_db), current_user: Optional[dict] = Depends(get_current_user_optional)):
    """
    저장된 채팅 세션 목록 조회 API
    """
    user_id = current_user.get("id") if current_user else None
    sessions = ChatHistoryService.get_sessions(db, limit=50, user_id=user_id)
    return {
        "success": True,
        "sessions": sessions
    }

@router.delete("/chat/history/{session_id}")
def delete_chat_session(session_id: str, db: Client = Depends(get_db), current_user: Optional[dict] = Depends(get_current_user_optional)):
    """
    특정 세션의 대화 내역 전체 삭제 API
    """
    user_id = current_user.get("id") if current_user else None
    deleted = ChatHistoryService.delete_session(db, session_id, user_id=user_id)
    return {
        "success": True,
        "message": f"Session {session_id} deleted successfully."
    }