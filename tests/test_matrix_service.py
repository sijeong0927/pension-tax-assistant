import pytest

from app.services.matrix_service import (
    INCOME_OVER_55M,
    INCOME_UNDER_55M,
    calculate_tax_credit_diagnosis,
    get_deduction_rate,
)


def test_deduction_rate_under_55m():
    assert get_deduction_rate(INCOME_UNDER_55M) == 0.165
    assert get_deduction_rate("lte_55m") == 0.165


def test_deduction_rate_over_55m():
    assert get_deduction_rate(INCOME_OVER_55M) == 0.132
    assert get_deduction_rate("gt_55m") == 0.132


def test_pension_savings_limit_is_capped_at_6m():
    result = calculate_tax_credit_diagnosis(
        income_range=INCOME_UNDER_55M,
        pension_savings_paid=8_000_000,
        irp_paid=0,
    )

    assert result.deductible_pension_savings == 6_000_000
    assert result.deductible_amount == 6_000_000
    assert result.estimated_refund == 990_000
    assert result.remaining_limit == 3_000_000
    assert result.recommended_additional_allocation.pension_savings == 0
    assert result.recommended_additional_allocation.irp == 3_000_000


def test_total_pension_limit_is_capped_at_9m():
    result = calculate_tax_credit_diagnosis(
        income_range=INCOME_OVER_55M,
        pension_savings_paid=6_000_000,
        irp_paid=5_000_000,
    )

    assert result.deductible_pension_savings == 6_000_000
    assert result.deductible_irp == 3_000_000
    assert result.deductible_amount == 9_000_000
    assert result.estimated_refund == 1_188_000
    assert result.remaining_limit == 0
    assert result.additional_refund_available == 0


def test_zero_paid_amount_returns_maximum_additional_refund():
    result = calculate_tax_credit_diagnosis(
        income_range=INCOME_UNDER_55M,
        pension_savings_paid=0,
        irp_paid=0,
    )

    assert result.deductible_amount == 0
    assert result.estimated_refund == 0
    assert result.remaining_limit == 9_000_000
    assert result.additional_refund_available == 1_485_000
    assert result.recommended_additional_allocation.pension_savings == 6_000_000
    assert result.recommended_additional_allocation.irp == 3_000_000


def test_recommended_allocation_fills_pension_savings_before_irp():
    result = calculate_tax_credit_diagnosis(
        income_range=INCOME_UNDER_55M,
        pension_savings_paid=3_000_000,
        irp_paid=0,
    )

    assert result.remaining_limit == 6_000_000
    assert result.recommended_additional_allocation.pension_savings == 3_000_000
    assert result.recommended_additional_allocation.irp == 3_000_000


def test_invalid_income_range_raises_value_error():
    with pytest.raises(ValueError):
        calculate_tax_credit_diagnosis("invalid", 0, 0)


def test_negative_paid_amount_raises_value_error():
    with pytest.raises(ValueError):
        calculate_tax_credit_diagnosis(INCOME_UNDER_55M, -1, 0)


def test_non_integer_paid_amount_raises_type_error():
    with pytest.raises(TypeError):
        calculate_tax_credit_diagnosis(INCOME_UNDER_55M, 1.5, 0)
