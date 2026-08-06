from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.db.session import get_db
from app.core.security import get_current_user_optional
from app.services.lite_tax_service import calculate_lite_tax_result

router = APIRouter()

class LiteTaxRequest(BaseModel):
    gross_salary: int
    family_count: int = 1
    prepaid_tax: Optional[int] = None
    session_id: Optional[str] = None

class LiteTaxResponse(BaseModel):
    success: bool
    data: Optional[dict] = None
    message: Optional[str] = None

@router.post("/lite-tax", response_model=LiteTaxResponse)
def calculate_lite_tax_endpoint(
    request: LiteTaxRequest,
    db: Client = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    try:
        pension_savings_paid = 0
        irp_paid = 0

        # 1. 로그인 유저인 경우 user_id로 연금저축/IRP 납입액 조회
        if current_user:
            user_id = current_user.get("id")
            res = db.table("tax_savings").select("pension_savings_paid, irp_paid").eq("user_id", user_id).execute()
            if res.data:
                pension_savings_paid = res.data[0].get("pension_savings_paid", 0)
                irp_paid = res.data[0].get("irp_paid", 0)
        # 2. 비로그인 유저이고 session_id가 주어진 경우 session_id로 조회
        elif request.session_id:
            res = db.table("tax_savings").select("pension_savings_paid, irp_paid").eq("session_id", request.session_id).execute()
            if res.data:
                pension_savings_paid = res.data[0].get("pension_savings_paid", 0)
                irp_paid = res.data[0].get("irp_paid", 0)

        # 3. 계산 엔진 실행
        result = calculate_lite_tax_result(
            gross_salary=request.gross_salary,
            family_count=request.family_count,
            pension_savings=pension_savings_paid,
            irp=irp_paid,
            prepaid_tax=request.prepaid_tax
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return LiteTaxResponse(
            success=True,
            data=result,
            message="Lite tax calculation completed successfully."
        )

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
