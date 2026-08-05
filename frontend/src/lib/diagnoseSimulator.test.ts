import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TOTAL_PENSION_ACCOUNT_MAX,
  clampIrpToCombinedLimit,
  getAvailableIrpLimit,
  getSliderFillPercent,
} from './diagnoseSimulator';

describe('diagnosis simulator IRP slider', () => {
  it('keeps the IRP bar fill stable when only pension savings changes within the combined limit', () => {
    const irpPaid = 3_000_000;

    const fillWithPensionAt350 = getSliderFillPercent(irpPaid, 0, TOTAL_PENSION_ACCOUNT_MAX);
    const fillWithPensionAt200 = getSliderFillPercent(irpPaid, 0, TOTAL_PENSION_ACCOUNT_MAX);

    assert.equal(fillWithPensionAt350, '33.33333333333333%');
    assert.equal(fillWithPensionAt200, fillWithPensionAt350);
  });

  it('shows the combined remaining limit separately from the fixed IRP scale', () => {
    assert.equal(getAvailableIrpLimit(3_500_000), 5_500_000);
    assert.equal(getAvailableIrpLimit(2_000_000), 7_000_000);
    assert.equal(TOTAL_PENSION_ACCOUNT_MAX, 9_000_000);
  });

  it('clamps IRP only when the combined pension account limit would be exceeded', () => {
    assert.equal(clampIrpToCombinedLimit(3_500_000, 3_000_000), 3_000_000);
    assert.equal(clampIrpToCombinedLimit(6_000_000, 4_000_000), 3_000_000);
  });
});
