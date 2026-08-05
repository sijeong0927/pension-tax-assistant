export const SALARY_MAX = 150_000_000;
export const SALARY_THRESHOLD = 55_000_000;
export const PENSION_SAVINGS_MAX = 6_000_000;
export const TOTAL_PENSION_ACCOUNT_MAX = 9_000_000;
export const PENSION_STEP = 500_000;
export const SALARY_STEP = 1_000_000;

export function getSliderFillPercent(value: number, min: number, max: number) {
  if (max <= min) return '0%';

  const fill = ((value - min) / (max - min)) * 100;
  return `${Math.min(100, Math.max(0, fill))}%`;
}

export function getAvailableIrpLimit(pensionSavings: number) {
  const deductiblePensionSavings = Math.min(
    Math.max(0, pensionSavings),
    PENSION_SAVINGS_MAX,
  );

  return Math.max(0, TOTAL_PENSION_ACCOUNT_MAX - deductiblePensionSavings);
}

export function clampIrpToCombinedLimit(pensionSavings: number, irp: number) {
  return Math.min(Math.max(0, irp), getAvailableIrpLimit(pensionSavings));
}
