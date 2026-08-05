from decimal import Decimal

import pytest

from app.services.tax_credit_service import (
    INCOME_OVER_55M,
    INCOME_UNDER_55M,
    calculate_tax_credit_diagnosis,
    determine_income_range,
    get_deduction_rate,
)


def test_determine_income_range_at_55m_boundary_is_under():
    assert determine_income_range(55_000_000) == INCOME_UNDER_55M


def test_determine_income_range_over_55m():
    assert determine_income_range(55_000_001) == INCOME_OVER_55M


def test_deduction_rate_under_55m():
    assert get_deduction_rate(55_000_000) == Decimal("0.165")


def test_deduction_rate_over_55m():
    assert get_deduction_rate(55_000_001) == Decimal("0.132")


def test_pension_savings_limit_is_capped_at_6m():
    result = calculate_tax_credit_diagnosis(
        total_salary=55_000_000,
        pension_savings_paid=8_000_000,
        irp_paid=0,
    )

    assert result.income_range == INCOME_UNDER_55M
    assert result.deductible_pension_savings == 6_000_000
    assert result.deductible_amount == 6_000_000
    assert result.maximum_tax_credit == 990_000
    assert result.remaining_limit == 3_000_000
    assert result.recommended_additional_allocation.pension_savings == 0
    assert result.recommended_additional_allocation.irp == 3_000_000


def test_total_pension_limit_is_capped_at_9m():
    result = calculate_tax_credit_diagnosis(
        total_salary=55_000_001,
        pension_savings_paid=6_000_000,
        irp_paid=5_000_000,
    )

    assert result.income_range == INCOME_OVER_55M
    assert result.deductible_pension_savings == 6_000_000
    assert result.deductible_irp == 3_000_000
    assert result.deductible_amount == 9_000_000
    assert result.maximum_tax_credit == 1_188_000
    assert result.remaining_limit == 0
    assert result.additional_refund_available == 0


def test_zero_paid_amount_returns_maximum_additional_refund():
    result = calculate_tax_credit_diagnosis(
        total_salary=55_000_000,
        pension_savings_paid=0,
        irp_paid=0,
    )

    assert result.deductible_amount == 0
    assert result.maximum_tax_credit == 0
    assert result.remaining_limit == 9_000_000
    assert result.additional_refund_available == 1_485_000
    assert result.recommended_additional_allocation.pension_savings == 6_000_000
    assert result.recommended_additional_allocation.irp == 3_000_000


def test_recommended_allocation_fills_pension_savings_before_irp():
    result = calculate_tax_credit_diagnosis(
        total_salary=55_000_000,
        pension_savings_paid=3_000_000,
        irp_paid=0,
    )

    assert result.remaining_limit == 6_000_000
    assert result.recommended_additional_allocation.pension_savings == 3_000_000
    assert result.recommended_additional_allocation.irp == 3_000_000


def test_pension_savings_only_over_9m_still_caps_at_6m():
    result = calculate_tax_credit_diagnosis(
        total_salary=55_000_000,
        pension_savings_paid=10_000_000,
        irp_paid=0,
    )

    assert result.deductible_pension_savings == 6_000_000
    assert result.deductible_irp == 0
    assert result.deductible_amount == 6_000_000
    assert result.remaining_limit == 3_000_000


def test_irp_only_can_fill_total_9m_limit():
    result = calculate_tax_credit_diagnosis(
        total_salary=55_000_000,
        pension_savings_paid=0,
        irp_paid=9_000_000,
    )

    assert result.deductible_pension_savings == 0
    assert result.deductible_irp == 9_000_000
    assert result.deductible_amount == 9_000_000
    assert result.maximum_tax_credit == 1_485_000
    assert result.remaining_limit == 0


def test_irp_only_over_9m_is_capped_at_total_limit():
    result = calculate_tax_credit_diagnosis(
        total_salary=55_000_001,
        pension_savings_paid=0,
        irp_paid=10_000_000,
    )

    assert result.deductible_pension_savings == 0
    assert result.deductible_irp == 9_000_000
    assert result.deductible_amount == 9_000_000
    assert result.maximum_tax_credit == 1_188_000
    assert result.remaining_limit == 0


def test_negative_total_salary_raises_value_error():
    with pytest.raises(ValueError):
        calculate_tax_credit_diagnosis(-1, 0, 0)


def test_negative_paid_amount_raises_value_error():
    with pytest.raises(ValueError):
        calculate_tax_credit_diagnosis(55_000_000, -1, 0)


def test_non_integer_paid_amount_raises_type_error():
    with pytest.raises(TypeError):
        calculate_tax_credit_diagnosis(55_000_000, 1.5, 0)


def test_bool_paid_amount_raises_type_error():
    with pytest.raises(TypeError):
        calculate_tax_credit_diagnosis(55_000_000, True, 0)


def test_bool_total_salary_raises_type_error():
    with pytest.raises(TypeError):
        calculate_tax_credit_diagnosis(True, 0, 0)


def test_low_salary_result_is_labeled_as_maximum_tax_credit_with_warning():
    result = calculate_tax_credit_diagnosis(
        total_salary=1_000_000,
        pension_savings_paid=6_000_000,
        irp_paid=3_000_000,
    )

    assert result.maximum_tax_credit == 1_485_000
    assert "최대 세액공제 효과" in result.disclaimer
    assert "실제 환급액이 아닙니다" in result.disclaimer
    assert "결정세액을 반드시 확인하세요" in result.disclaimer
