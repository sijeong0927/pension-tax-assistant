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

    @staticmethod
    def get_sessions(db: Session, limit: int = 50) -> List[dict]:
        """
        저장된 세션 목록 조회 (가장 최근 메시지 기준 내림차순 정렬)
        세션별로 가장 첫 번째 사용자 메시지를 미리보기로 사용합니다.
        (PII는 저장 시 이미 마스킹되어 있습니다)
        """
        from sqlalchemy import func
        
        # 1. 세션별 최신 메시지 시간과 메시지 갯수 조회
        session_stats = db.query(
            ChatHistory.session_id,
            func.count(ChatHistory.id).label('total_count'),
            func.max(ChatHistory.created_at).label('last_activity')
        ).group_by(ChatHistory.session_id).order_by(func.max(ChatHistory.created_at).desc()).limit(limit).all()

        sessions = []
        for stat in session_stats:
            # 2. 각 세션의 첫 번째 사용자 메시지 조회
            first_user_msg = db.query(ChatHistory)\
                .filter(ChatHistory.session_id == stat.session_id, ChatHistory.role == 'user')\
                .order_by(ChatHistory.created_at.asc())\
                .first()
            
            preview = first_user_msg.message[:60] if first_user_msg else "새 상담"

            sessions.append({
                "session_id": stat.session_id,
                "preview": preview,
                "created_at": int(stat.last_activity.timestamp() * 1000) if stat.last_activity else 0,
                "total_count": stat.total_count
            })
            
        return sessions

    @staticmethod
    def delete_session(db: Session, session_id: str) -> bool:
        """
        특정 세션의 대화 이력을 모두 삭제합니다.
        """
        deleted_count = db.query(ChatHistory).filter(ChatHistory.session_id == session_id).delete()
        db.commit()
        return deleted_count > 0