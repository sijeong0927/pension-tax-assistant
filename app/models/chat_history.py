from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.db.session import Base

class ChatHistory(Base):
    __tablename__ = "chat_histories"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(100), index=True, nullable=False)
    role = Column(String(20), nullable=False)  # 'user' 또는 'assistant'
    message = Column(Text, nullable=False)     # PII 마스킹된 대화 내용
    created_at = Column(DateTime, default=datetime.utcnow)