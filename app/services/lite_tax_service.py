from decimal import Decimal, ROUND_DOWN
from typing import Optional, Dict, Any

def _floor_won(amount: Decimal) -> int:
    return int(amount.quantize(Decimal("1"), rounding=ROUND_DOWN))

def calculate_lite_tax_result(
    gross_salary: int,
    family_count: int = 1,
    pension_savings: int = 0,
    irp: int = 0,
    prepaid_tax: Optional[int] = None
) -> Dict[str, Any]:
    """
    간이 연말정산 통합 계산 엔진 (2026 세법 기준)
    """
    if gross_salary <= 0:
        return {"error": "연봉은 0원보다 커야 합니다."}

    # 1. 총급여액 계산 (식대 비과세 월 20만 원 / 연 240만 원 자동 차감)
    meal_tax_free = min(gross_salary, 2400000)
    taxable_income = max(0, gross_salary - meal_tax_free)

    # 2. 소득공제 계산
    # 2-1. 근로소득공제
    taxable_income_dec = Decimal(taxable_income)
    if taxable_income_dec <= 5000000:
        earned_income_deduction = taxable_income_dec * Decimal("0.7")
    elif taxable_income_dec <= 15000000:
        earned_income_deduction = Decimal("3500000") + (taxable_income_dec - Decimal("5000000")) * Decimal("0.4")
    elif taxable_income_dec <= 45000000:
        earned_income_deduction = Decimal("7500000") + (taxable_income_dec - Decimal("15000000")) * Decimal("0.15")
    elif taxable_income_dec <= 100000000:
        earned_income_deduction = Decimal("12000000") + (taxable_income_dec - Decimal("45000000")) * Decimal("0.05")
    else:
        earned_income_deduction = Decimal("14750000") + (taxable_income_dec - Decimal("100000000")) * Decimal("0.02")
    
    earned_income_deduction = min(earned_income_deduction, Decimal("20000000"))

    # 2-2. 기본 인적공제 (1인당 150만 원)
    personal_deduction = Decimal(max(1, family_count)) * Decimal("1500000")

    # 2-3. 4대보험 공제 (표준 요율 자동 계산)
    monthly_income = taxable_income_dec / Decimal("12")
    pension_monthly = min(monthly_income * Decimal("0.045"), Decimal("265500"))
    pension_yearly = pension_monthly * Decimal("12")
    health_yearly = taxable_income_dec * Decimal("0.03545")
    long_term_care_yearly = health_yearly * Decimal("0.1295")
    employment_yearly = taxable_income_dec * Decimal("0.009")
    insurance_deduction = _floor_won(pension_yearly + health_yearly + long_term_care_yearly + employment_yearly)

    # 3. 과세표준 산출
    total_deductions = earned_income_deduction + personal_deduction + Decimal(insurance_deduction)
    tax_base = max(Decimal("0"), taxable_income_dec - total_deductions)
    tax_base_int = _floor_won(tax_base)

    # 4. 산출세액 산출 (기본세율 적용)
    calculated_tax = Decimal("0")
    if tax_base_int <= 14000000:
        calculated_tax = Decimal(tax_base_int) * Decimal("0.06")
    elif tax_base_int <= 50000000:
        calculated_tax = Decimal(tax_base_int) * Decimal("0.15") - Decimal("1260000")
    elif tax_base_int <= 88000000:
        calculated_tax = Decimal(tax_base_int) * Decimal("0.24") - Decimal("5760000")
    elif tax_base_int <= 150000000:
        calculated_tax = Decimal(tax_base_int) * Decimal("0.35") - Decimal("15440000")
    elif tax_base_int <= 300000000:
        calculated_tax = Decimal(tax_base_int) * Decimal("0.38") - Decimal("19940000")
    elif tax_base_int <= 500000000:
        calculated_tax = Decimal(tax_base_int) * Decimal("0.40") - Decimal("25940000")
    elif tax_base_int <= 1000000000:
        calculated_tax = Decimal(tax_base_int) * Decimal("0.42") - Decimal("35940000")
    else:
        calculated_tax = Decimal(tax_base_int) * Decimal("0.45") - Decimal("65940000")
    
    calculated_tax_int = _floor_won(max(Decimal("0"), calculated_tax))

    # 5. 세액공제 계산
    # 5-1. 근로소득 세액공제
    earned_income_tax_credit = 0
    if calculated_tax_int > 0:
        if calculated_tax_int <= 1300000:
            credit_target = Decimal(calculated_tax_int) * Decimal("0.55")
        else:
            credit_target = Decimal("715000") + (Decimal(calculated_tax_int) - Decimal("1300000")) * Decimal("0.3")

        limit = Decimal("740000")
        if Decimal("33000000") < taxable_income_dec <= Decimal("70000000"):
            limit = max(Decimal("740000") - (taxable_income_dec - Decimal("33000000")) * Decimal("0.008"), Decimal("660000"))
        elif Decimal("70000000") < taxable_income_dec <= Decimal("120000000"):
            limit = max(Decimal("660000") - (taxable_income_dec - Decimal("70000000")) * Decimal("0.5") * Decimal("0.008"), Decimal("500000"))
        elif taxable_income_dec > Decimal("120000000"):
            limit = max(Decimal("500000") - (taxable_income_dec - Decimal("120000020")) * Decimal("0.5") * Decimal("0.008"), Decimal("200000")) # 120000000 분기
            # 원 소스 코드: limit = Math.max(500000 - (taxableIncome - 120000000) * 0.5 * 0.008, 200000)
            limit = max(Decimal("500000") - (taxable_income_dec - Decimal("120000000")) * Decimal("0.5") * Decimal("0.008"), Decimal("200000"))
            
        earned_income_tax_credit = _floor_won(min(credit_target, limit))

    # 5-2. 연금계좌 세액공제
    valid_pension = min(pension_savings, 6000000)
    eligible_pension_total = min(valid_pension + irp, 9000000)
    pension_rate = Decimal("0.15") if taxable_income_dec <= Decimal("55000000") else Decimal("0.12")
    pension_tax_credit = _floor_won(Decimal(eligible_pension_total) * pension_rate)

    # 6. 결정세액 (소득세 기준)
    total_tax_credit = earned_income_tax_credit + pension_tax_credit
    final_tax = max(0, calculated_tax_int - total_tax_credit)

    # 7. 기납부세액 및 최종 정산액 산출
    if prepaid_tax is not None:
        actual_prepaid_tax = prepaid_tax
    else:
        actual_prepaid_tax = _floor_won(Decimal(final_tax) * Decimal("1.05"))
    
    income_tax_diff = final_tax - actual_prepaid_tax
    local_tax_diff = _floor_won(Decimal(income_tax_diff) * Decimal("0.1"))
    total_difference = income_tax_diff + local_tax_diff

    return {
        "grossSalary": gross_salary,
        "taxableIncome": taxable_income,
        "taxBase": tax_base_int,
        "calculatedTax": calculated_tax_int,
        "earnedIncomeTaxCredit": earned_income_tax_credit,
        "pensionTaxCredit": pension_tax_credit,
        "finalTax": final_tax,
        "estimatedPrepaidTax": actual_prepaid_tax,
        "incomeTaxDiff": income_tax_diff,
        "localTaxDiff": local_tax_diff,
        "totalDifference": total_difference,
        "status": "REFUND" if total_difference <= 0 else "PAYMENT"
    }
