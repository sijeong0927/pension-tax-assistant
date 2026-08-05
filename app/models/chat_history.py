from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from app.db.session import Base

class ChatHistory(Base):
    __tablename__ = "chat_histories"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(100), index=True, nullable=False)
    role = Column(String(20), nullable=False)  # 'user' 또는 'assistant'
    message = Column(Text, nullable=False)     # PII 마스킹된 대화 내용
    created_at = Column(DateTime, default=datetime.utcnow)
    source_record = relationship(
        "ChatHistorySource",
        back_populates="chat_history",
        uselist=False,
        cascade="all, delete-orphan",
    )


class ChatHistorySource(Base):
    """assistant 답변에 사용된 RAG 출처 메타데이터를 보관한다."""

    __tablename__ = "chat_history_sources"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    chat_history_id = Column(
        Integer,
        ForeignKey("chat_histories.id"),
        unique=True,
        index=True,
        nullable=False,
    )
    sources_json = Column(Text, nullable=False, default="[]")

    chat_history = relationship("ChatHistory", back_populates="source_record")
