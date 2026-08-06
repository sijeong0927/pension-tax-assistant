import pytest
from app.services.lite_tax_service import calculate_lite_tax_result

def test_calculate_lite_tax_invalid_salary():
    result = calculate_lite_tax_result(gross_salary=0)
    assert "error" in result
    assert result["error"] == "연봉은 0원보다 커야 합니다."

    result_negative = calculate_lite_tax_result(gross_salary=-100)
    assert "error" in result_negative

def test_calculate_lite_tax_prepaid_tax_estimation():
    # 기납부세액 미입력 시 결정세액의 1.05배 자동 추정 확인
    result = calculate_lite_tax_result(
        gross_salary=50_000_000,
        family_count=1,
        pension_savings=0,
        irp=0,
        prepaid_tax=None
    )
    
    final_tax = result["finalTax"]
    expected_prepaid = int(final_tax * 1.05)
    assert result["estimatedPrepaidTax"] == expected_prepaid

def test_calculate_lite_tax_dummy_case_verification():
    # gross_salary=50,000,000, family_count=1, pension_savings=3,000,000, irp=2,000,000, prepaid_tax=1,000,000
    result = calculate_lite_tax_result(
        gross_salary=50_000_000,
        family_count=1,
        pension_savings=3_000_000,
        irp=2_000_000,
        prepaid_tax=1_000_000
    )
    
    assert result["grossSalary"] == 50_000_000
    assert result["taxableIncome"] == 47_600_000 # 5000만 - 식대비과세 240만
    
    # 4대보험공제 검증
    # pension = min((47600000 / 12) * 0.045, 265500) * 12 = 178500 * 12 = 2,142,000
    # health = 47600000 * 0.03545 = 1,687,420
    # care = health * 0.1295 = 1687420 * 0.1295 = 218,520 (버림)
    # employment = 47600000 * 0.009 = 428,400
    # 합계 = 2142000 + 1687420 + 218520.89 + 428400 = 4,476,340.89 => 버림 4,476,340
    # 근로소득공제 = 12,000,000 + (47,600,000 - 45,000,000) * 0.05 = 12,130,000
    # 기본공제 = 1,500,000
    # 과세표준 = 47,600,000 - (12,130,000 + 1,500,000 + 4,476,340) = 29,493,660
    assert result["taxBase"] == 29_493_660
    
    # 산출세액 = 29,493,660 * 0.15 - 1,260,000 = 3,164,049
    assert result["calculatedTax"] == 3_164_049
    
    # 근로소득세액공제 = 715,000 + (3,164,049 - 1,300,000) * 0.3 = 715,000 + 559,214 = 1,274,214
    # 한도(총급여 4,760만) = 740,000 - (47,600,000 - 33,000,000) * 0.008 = 740,000 - 116,800 = 623,200
    # 한도 최솟값 = 660,000
    # 따라서 한도는 660,000
    # 공제액 = min(1274214, 660000) = 660,000
    assert result["earnedIncomeTaxCredit"] == 660_000

    # 연금계좌세액공제 = (3,000,000 + 2,000,000) * 0.15 = 750,000 (총급여 5500만 이하)
    assert result["pensionTaxCredit"] == 750_000

    # 결정세액 = max(0, 3,164,049 - (660,000 + 750,000)) = 1,754,049
    assert result["finalTax"] == 1_754_049

    # 최종 정산 예상액
    # 소득세차액 = 1,754,049 - 1,000,000 = 754,049
    # 지방소득세차액 = int(754,049 * 0.1) = 75,404
    # 최종차액 = 754,049 + 75,404 = 829,453
    assert result["incomeTaxDiff"] == 754_049
    assert result["localTaxDiff"] == 75_404
    assert result["totalDifference"] == 829_453
    assert result["status"] == "PAYMENT"
