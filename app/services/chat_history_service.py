import re
from typing import List
from sqlalchemy.orm import Session
from app.models.chat_history import ChatHistory

class ChatHistoryService:
    @staticmethod
    def mask_pii(text: str) -> str:
        """
        주민등록번호, 전화번호 등 민감정보(PII) 사전 마스킹 처리
        """
        if not text:
            return text
        
        # 1. 주민등록번호 패턴 (예: 990101-1234567 -> 990101-*******)
        rrn_pattern = r'\b(\d{6})[- ]?([1-4]\d{6})\b'
        text = re.sub(rrn_pattern, r'\1-*******', text)

        # 2. 휴대전화번호 패턴 (예: 010-1234-5678 -> 010-****-5678)
        phone_pattern = r'\b(01[016789])[- ]?(\d{3,4})[- ]?(\d{4})\b'
        text = re.sub(phone_pattern, r'\1-****-\3', text)

        return text

    @staticmethod
    def save_message(db: Session, session_id: str, role: str, message: str) -> ChatHistory:
        """
        대화 메시지 마스킹 후 DB 저장
        """
        masked_message = ChatHistoryService.mask_pii(message)
        chat_entry = ChatHistory(
            session_id=session_id,
            role=role,
            message=masked_message
        )
        db.add(chat_entry)
        db.commit()
        db.refresh(chat_entry)
        return chat_entry

    @staticmethod
    def get_history(db: Session, session_id: str, limit: int = 50) -> List[ChatHistory]:
        """
        특정 세션의 대화 이력 조회
        """
        return db.query(ChatHistory)\
                 .filter(ChatHistory.session_id == session_id)\
                 .order_by(ChatHistory.created_at.asc())\
                 .limit(limit)\
                 .all()