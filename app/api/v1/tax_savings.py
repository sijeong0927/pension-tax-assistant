from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.db.session import get_db
from app.models.tax_savings import TaxSavings

router = APIRouter()

class TaxSavingsRequest(BaseModel):
    session_id: str
    income_range: str
    pension_savings_paid: int
    irp_paid: int
    deductible_pension_savings: int
    deductible_irp: int
    deductible_amount: int
    gross_tax_credit: int
    estimated_refund: int

class TaxSavingsResponse(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None

@router.post("/tax-savings", response_model=TaxSavingsResponse)
def save_tax_savings(request: TaxSavingsRequest, db: Session = Depends(get_db)):
    try:
        # Upsert logic
        savings_record = db.query(TaxSavings).filter(TaxSavings.session_id == request.session_id).first()
        
        if savings_record:
            savings_record.income_range = request.income_range
            savings_record.pension_savings_paid = request.pension_savings_paid
            savings_record.irp_paid = request.irp_paid
            savings_record.deductible_pension_savings = request.deductible_pension_savings
            savings_record.deductible_irp = request.deductible_irp
            savings_record.deductible_amount = request.deductible_amount
            savings_record.gross_tax_credit = request.gross_tax_credit
            savings_record.estimated_refund = request.estimated_refund
            savings_record.updated_at = datetime.now(timezone.utc)
        else:
            savings_record = TaxSavings(
                session_id=request.session_id,
                income_range=request.income_range,
                pension_savings_paid=request.pension_savings_paid,
                irp_paid=request.irp_paid,
                deductible_pension_savings=request.deductible_pension_savings,
                deductible_irp=request.deductible_irp,
                deductible_amount=request.deductible_amount,
                gross_tax_credit=request.gross_tax_credit,
                estimated_refund=request.estimated_refund,
            )
            db.add(savings_record)
        
        db.commit()
        db.refresh(savings_record)
        
        return TaxSavingsResponse(success=True, message="Tax savings data saved successfully.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tax-savings/{session_id}", response_model=TaxSavingsResponse)
def get_tax_savings(session_id: str, db: Session = Depends(get_db)):
    savings_record = db.query(TaxSavings).filter(TaxSavings.session_id == session_id).first()
    
    if not savings_record:
        return TaxSavingsResponse(success=False, message="No data found for this session.")
        
    return TaxSavingsResponse(
        success=True,
        message="Tax savings data retrieved successfully.",
        data={
            "income_range": savings_record.income_range,
            "pension_savings_paid": savings_record.pension_savings_paid,
            "irp_paid": savings_record.irp_paid,
            "deductible_pension_savings": savings_record.deductible_pension_savings,
            "deductible_irp": savings_record.deductible_irp,
            "deductible_amount": savings_record.deductible_amount,
            "gross_tax_credit": savings_record.gross_tax_credit,
            "estimated_refund": savings_record.estimated_refund,
        }
    )
