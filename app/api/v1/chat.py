from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.rag_service import RAGService

router = APIRouter()
rag_service = RAGService()


class ChatQueryRequest(BaseModel):
    question: str = Field(..., description="유저의 연금/절세 관련 질문", example="연금저축이랑 IRP 차이가 뭐야?")


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
def query_chat(request: ChatQueryRequest):
    try:
        # RAG 서비스를 통한 질문 답변 생성
        result = rag_service.answer_question(request.question)
        
        # 1. 속성값 읽기 (answer, sources)
        raw_answer = getattr(result, "answer", "")
        raw_sources = getattr(result, "sources", [])

        # result가 dict일 경우 처리
        if isinstance(result, dict):
            raw_answer = result.get("answer", "")
            raw_sources = result.get("sources", [])

        # 2. sources 내부 element들을 dict로 강제 변환
        formatted_sources = [_to_dict(s) for s in raw_sources]

        return ChatQueryResponse(
            success=True,
            answer=str(raw_answer),
            sources=formatted_sources
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"챗봇 응답 생성 중 오류 발생: {str(e)}")