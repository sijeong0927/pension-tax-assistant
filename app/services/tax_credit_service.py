from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


INCOME_UNDER_55M = "under_55m"
INCOME_OVER_55M = "over_55m"

SALARY_THRESHOLD = 55_000_000
DEDUCTION_RATE_UNDER_55M = Decimal("0.165")
DEDUCTION_RATE_OVER_55M = Decimal("0.132")

PENSION_SAVINGS_LIMIT = 6_000_000
TOTAL_PENSION_LIMIT = 9_000_000


@dataclass(frozen=True)
class RecommendedAllocation:
    pension_savings: int
    irp: int


@dataclass(frozen=True)
class TaxCreditDiagnosis:
    total_salary: int
    income_range: str
    deduction_rate: Decimal
    pension_savings_limit: int
    total_pension_limit: int
    pension_savings_paid: int
    irp_paid: int
    deductible_pension_savings: int
    deductible_irp: int
    deductible_amount: int
    maximum_tax_credit: int
    remaining_limit: int
    additional_refund_available: int
    recommended_additional_allocation: RecommendedAllocation
    message: str
    disclaimer: str


def _validate_won_amount(name: str, amount: int) -> None:
    if isinstance(amount, bool) or not isinstance(amount, int):
        raise TypeError(f"{name} must be an integer amount in won")

    if amount < 0:
        raise ValueError(f"{name} must be greater than or equal to 0")


def determine_income_range(total_salary: int) -> str:
    _validate_won_amount("total_salary", total_salary)

    if total_salary <= SALARY_THRESHOLD:
        return INCOME_UNDER_55M

    return INCOME_OVER_55M


def get_deduction_rate(total_salary: int) -> Decimal:
    income_range = determine_income_range(total_salary)

    if income_range == INCOME_UNDER_55M:
        return DEDUCTION_RATE_UNDER_55M

    return DEDUCTION_RATE_OVER_55M


def _round_won(amount: Decimal) -> int:
    return int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


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
    deduction_rate: Decimal,
    deductible_amount: int,
    remaining_limit: int,
) -> str:
    refund_rate_percent = deduction_rate * Decimal("100")

    if remaining_limit == 0:
        return (
            f"연금계좌 세액공제 한도 {TOTAL_PENSION_LIMIT:,}원을 모두 채웠습니다. "
            f"현재 적용 공제율은 {refund_rate_percent:.1f}%입니다."
        )

    if deductible_amount == 0:
        return (
            f"현재 적용 공제율은 {refund_rate_percent:.1f}%입니다. "
            f"연금저축과 IRP를 활용해 최대 {TOTAL_PENSION_LIMIT:,}원까지 "
            "세액공제 대상 납입액을 만들 수 있습니다."
        )

    return (
        f"현재 적용 공제율은 {refund_rate_percent:.1f}%입니다. "
        f"세액공제 한도까지 추가로 {remaining_limit:,}원 납입할 수 있습니다."
    )


def _build_disclaimer(maximum_tax_credit: int, total_salary: int) -> str:
    warning = (
        "표시 금액은 공제대상 납입액에 공제율을 적용한 최대 세액공제 효과이며, "
        "실제 환급액이 아닙니다. 실제 적용액은 결정세액을 초과할 수 없고 "
        "다른 공제 항목과 신고 결과에 따라 달라질 수 있습니다."
    )

    if maximum_tax_credit > total_salary:
        return (
            f"{warning} 현재 계산된 최대 세액공제 효과 {maximum_tax_credit:,}원이 "
            f"입력한 총급여 {total_salary:,}원보다 크므로 결정세액을 반드시 확인하세요."
        )

    return warning


def calculate_tax_credit_diagnosis(
    total_salary: int,
    pension_savings_paid: int = 0,
    irp_paid: int = 0,
) -> TaxCreditDiagnosis:
    _validate_won_amount("pension_savings_paid", pension_savings_paid)
    _validate_won_amount("irp_paid", irp_paid)

    income_range = determine_income_range(total_salary)
    deduction_rate = get_deduction_rate(total_salary)

    deductible_pension_savings = min(pension_savings_paid, PENSION_SAVINGS_LIMIT)
    remaining_after_pension_savings = TOTAL_PENSION_LIMIT - deductible_pension_savings
    deductible_irp = min(irp_paid, max(remaining_after_pension_savings, 0))
    deductible_amount = deductible_pension_savings + deductible_irp
    maximum_tax_credit = _round_won(Decimal(deductible_amount) * deduction_rate)
    remaining_limit = max(TOTAL_PENSION_LIMIT - deductible_amount, 0)
    additional_refund_available = _round_won(Decimal(remaining_limit) * deduction_rate)
    recommended_allocation = _calculate_recommended_additional_allocation(
        pension_savings_paid=pension_savings_paid,
        irp_paid=irp_paid,
    )

    return TaxCreditDiagnosis(
        total_salary=total_salary,
        income_range=income_range,
        deduction_rate=deduction_rate,
        pension_savings_limit=PENSION_SAVINGS_LIMIT,
        total_pension_limit=TOTAL_PENSION_LIMIT,
        pension_savings_paid=pension_savings_paid,
        irp_paid=irp_paid,
        deductible_pension_savings=deductible_pension_savings,
        deductible_irp=deductible_irp,
        deductible_amount=deductible_amount,
        maximum_tax_credit=maximum_tax_credit,
        remaining_limit=remaining_limit,
        additional_refund_available=additional_refund_available,
        recommended_additional_allocation=recommended_allocation,
        message=_build_message(
            deduction_rate=deduction_rate,
            deductible_amount=deductible_amount,
            remaining_limit=remaining_limit,
        ),
        disclaimer=_build_disclaimer(
            maximum_tax_credit=maximum_tax_credit,
            total_salary=total_salary,
        ),
    )
