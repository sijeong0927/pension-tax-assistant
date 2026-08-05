from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from datetime import datetime, timezone
from app.db.session import Base

class TaxSavings(Base):
    __tablename__ = "tax_savings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    session_id = Column(String, index=True, nullable=False, unique=True)
    
    # 입력값 및 진단 결과
    income_range = Column(String, nullable=False)
    pension_savings_paid = Column(Integer, default=0)
    irp_paid = Column(Integer, default=0)
    
    # 계산 결과
    deductible_pension_savings = Column(Integer, default=0)
    deductible_irp = Column(Integer, default=0)
    deductible_amount = Column(Integer, default=0)
    gross_tax_credit = Column(Integer, default=0)
    estimated_refund = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
