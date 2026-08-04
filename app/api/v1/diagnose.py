from dataclasses import asdict
from typing import Any, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# 서비스 모듈에서 작성하신 함수 가져오기
from app.services.tax_credit_service import calculate_tax_credit_diagnosis

router = APIRouter()


class TaxDiagnosisRequest(BaseModel):
    total_salary: int = Field(..., description="총급여액 (원)", example=50000000)
    pension_savings: int = Field(0, description="연금저축 납입액 (원)", example=4000000)
    irp: int = Field(0, description="IRP 납입액 (원)", example=3000000)


class TaxDiagnosisResponse(BaseModel):
    success: bool = True
    data: Dict[str, Any] = Field(..., description="진단 계산 결과 리포트")


@router.post("/tax/diagnose", response_model=TaxDiagnosisResponse)
def diagnose_tax(request: TaxDiagnosisRequest):
    try:
        # 서비스 함수 호출 (함수명: calculate_tax_credit_diagnosis)
        diagnosis_result = calculate_tax_credit_diagnosis(
            total_salary=request.total_salary,
            pension_savings_paid=request.pension_savings,
            irp_paid=request.irp
        )
        
        # dataclass 객체를 dict로 변환하여 응답
        return TaxDiagnosisResponse(success=True, data=asdict(diagnosis_result))
        
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"진단 중 오류 발생: {str(e)}")