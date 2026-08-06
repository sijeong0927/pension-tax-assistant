from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client
from datetime import datetime, timezone

from app.db.session import get_db
from app.core.security import get_current_user, get_current_user_optional

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
def save_tax_savings(
    request: TaxSavingsRequest,
    db: Client = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        user_id = current_user.get("id")
        
        # 1. user_id 기반 기록 조회
        res = db.table("tax_savings").select("*").eq("user_id", user_id).execute()
        records = res.data
        
        # 2. user_id로 없을 시 session_id 조회
        if not records:
            res_session = db.table("tax_savings").select("*").eq("session_id", request.session_id).execute()
            records = res_session.data
        
        now_str = datetime.now(timezone.utc).isoformat()
        
        save_payload = {
            "session_id": request.session_id,
            "user_id": user_id,
            "income_range": request.income_range,
            "pension_savings_paid": request.pension_savings_paid,
            "irp_paid": request.irp_paid,
            "deductible_pension_savings": request.deductible_pension_savings,
            "deductible_irp": request.deductible_irp,
            "deductible_amount": request.deductible_amount,
            "gross_tax_credit": request.gross_tax_credit,
            "estimated_refund": request.estimated_refund,
            "updated_at": now_str,
        }

        if records:
            # Update 기존 기록
            record_id = records[0]["id"]
            db.table("tax_savings").update(save_payload).eq("id", record_id).execute()
        else:
            # Insert 신규 기록
            save_payload["created_at"] = now_str
            db.table("tax_savings").insert(save_payload).execute()
        
        return TaxSavingsResponse(success=True, message="Tax savings data saved successfully.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tax-savings/{session_id}", response_model=TaxSavingsResponse)
def get_tax_savings(
    session_id: str,
    db: Client = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    if current_user:
        user_id = current_user.get("id")
        res = db.table("tax_savings").select("*").eq("user_id", user_id).execute()
    else:
        res = db.table("tax_savings").select("*").eq("session_id", session_id).execute()
    
    records = res.data
    if not records:
        return TaxSavingsResponse(success=False, message="No data found for this session.")
        
    savings_record = records[0]
    return TaxSavingsResponse(
        success=True,
        message="Tax savings data retrieved successfully.",
        data={
            "income_range": savings_record["income_range"],
            "pension_savings_paid": savings_record["pension_savings_paid"],
            "irp_paid": savings_record["irp_paid"],
            "deductible_pension_savings": savings_record["deductible_pension_savings"],
            "deductible_irp": savings_record["deductible_irp"],
            "deductible_amount": savings_record["deductible_amount"],
            "gross_tax_credit": savings_record["gross_tax_credit"],
            "estimated_refund": savings_record["estimated_refund"],
        }
    )
