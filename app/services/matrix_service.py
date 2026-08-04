from dataclasses import dataclass


INCOME_UNDER_55M = "under_55m"
INCOME_OVER_55M = "over_55m"

DEDUCTION_RATE_UNDER_55M = 0.165
DEDUCTION_RATE_OVER_55M = 0.132

PENSION_SAVINGS_LIMIT = 6_000_000
TOTAL_PENSION_LIMIT = 9_000_000

INCOME_RANGE_ALIASES = {
    INCOME_UNDER_55M: INCOME_UNDER_55M,
    "under": INCOME_UNDER_55M,
    "below_55m": INCOME_UNDER_55M,
    "lte_55m": INCOME_UNDER_55M,
    INCOME_OVER_55M: INCOME_OVER_55M,
    "over": INCOME_OVER_55M,
    "above_55m": INCOME_OVER_55M,
    "gt_55m": INCOME_OVER_55M,
}


@dataclass(frozen=True)
class RecommendedAllocation:
    pension_savings: int
    irp: int


@dataclass(frozen=True)
class TaxCreditDiagnosis:
    income_range: str
    deduction_rate: float
    pension_savings_limit: int
    total_pension_limit: int
    pension_savings_paid: int
    irp_paid: int
    deductible_pension_savings: int
    deductible_irp: int
    deductible_amount: int
    estimated_refund: int
    remaining_limit: int
    additional_refund_available: int
    recommended_additional_allocation: RecommendedAllocation
    message: str


def normalize_income_range(income_range: str) -> str:
    try:
        normalized = INCOME_RANGE_ALIASES[income_range.strip()]
    except (AttributeError, KeyError) as exc:
        raise ValueError(
            "income_range must be one of: under_55m, over_55m, "
            "below_55m, above_55m, lte_55m, gt_55m"
        ) from exc

    return normalized


def get_deduction_rate(income_range: str) -> float:
    normalized_income_range = normalize_income_range(income_range)

    if normalized_income_range == INCOME_UNDER_55M:
        return DEDUCTION_RATE_UNDER_55M

    return DEDUCTION_RATE_OVER_55M


def _validate_paid_amount(name: str, amount: int) -> None:
    if not isinstance(amount, int):
        raise TypeError(f"{name} must be an integer amount in won")

    if amount < 0:
        raise ValueError(f"{name} must be greater than or equal to 0")


def _calculate_recommended_additional_allocation(
    pension_savings_paid: int,
    irp_paid: int,
) -> RecommendedAllocation:
    deductible_pension_savings = min(pension_savings_paid, PENSION_SAVINGS_LIMIT)
    deductible_total = min(deductible_pension_savings + irp_paid, TOTAL_PENSION_LIMIT)
    remaining_limit = TOTAL_PENSION_LIMIT - deductible_total

    if remaining_limit <= 0:
        return RecommendedAllocation(pension_savings=0, irp=0)

    pension_savings_room = max(PENSION_SAVINGS_LIMIT - pension_savings_paid, 0)
    recommended_pension_savings = min(pension_savings_room, remaining_limit)
    recommended_irp = remaining_limit - recommended_pension_savings

    return RecommendedAllocation(
        pension_savings=recommended_pension_savings,
        irp=recommended_irp,
    )


def _build_message(
    deduction_rate: float,
    deductible_amount: int,
    remaining_limit: int,
) -> str:
    refund_rate_percent = deduction_rate * 100

    if remaining_limit == 0:
        return (
            "The annual pension tax credit limit is fully used. "
            f"The applied credit rate is {refund_rate_percent:.1f}%."
        )

    if deductible_amount == 0:
        return (
            f"The applied credit rate is {refund_rate_percent:.1f}%. "
            "You can create up to 9,000,000 won of deductible pension contributions."
        )

    return (
        f"The applied credit rate is {refund_rate_percent:.1f}%. "
        f"You can add {remaining_limit:,} won before reaching the annual limit."
    )


def calculate_tax_credit_diagnosis(
    income_range: str,
    pension_savings_paid: int = 0,
    irp_paid: int = 0,
) -> TaxCreditDiagnosis:
    _validate_paid_amount("pension_savings_paid", pension_savings_paid)
    _validate_paid_amount("irp_paid", irp_paid)

    normalized_income_range = normalize_income_range(income_range)
    deduction_rate = get_deduction_rate(normalized_income_range)

    deductible_pension_savings = min(pension_savings_paid, PENSION_SAVINGS_LIMIT)
    remaining_after_pension_savings = TOTAL_PENSION_LIMIT - deductible_pension_savings
    deductible_irp = min(irp_paid, max(remaining_after_pension_savings, 0))
    deductible_amount = deductible_pension_savings + deductible_irp
    estimated_refund = int(round(deductible_amount * deduction_rate))
    remaining_limit = max(TOTAL_PENSION_LIMIT - deductible_amount, 0)
    additional_refund_available = int(round(remaining_limit * deduction_rate))
    recommended_allocation = _calculate_recommended_additional_allocation(
        pension_savings_paid=pension_savings_paid,
        irp_paid=irp_paid,
    )

    return TaxCreditDiagnosis(
        income_range=normalized_income_range,
        deduction_rate=deduction_rate,
        pension_savings_limit=PENSION_SAVINGS_LIMIT,
        total_pension_limit=TOTAL_PENSION_LIMIT,
        pension_savings_paid=pension_savings_paid,
        irp_paid=irp_paid,
        deductible_pension_savings=deductible_pension_savings,
        deductible_irp=deductible_irp,
        deductible_amount=deductible_amount,
        estimated_refund=estimated_refund,
        remaining_limit=remaining_limit,
        additional_refund_available=additional_refund_available,
        recommended_additional_allocation=recommended_allocation,
        message=_build_message(
            deduction_rate=deduction_rate,
            deductible_amount=deductible_amount,
            remaining_limit=remaining_limit,
        ),
    )
