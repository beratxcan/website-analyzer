import { describe, expect, it } from 'vitest';
import { estimateCostUsd, getModelPricing, USD_CURRENCY } from '../src/usage';

describe('estimateCostUsd', () => {
  it('computes cost for a known model', () => {
    // gpt-4o-mini: $0.15/M input, $0.60/M output.
    const estimate = estimateCostUsd('gpt-4o-mini', 1_000_000, 1_000_000);
    expect(estimate).toEqual({ costUsd: 0.75, currency: USD_CURRENCY });
  });

  it('returns null for unknown models instead of fabricating a price', () => {
    expect(estimateCostUsd('made-up-model', 1_000_000, 1_000_000)).toBeNull();
  });

  it('scales with token counts', () => {
    const small = estimateCostUsd('gpt-4o-mini', 1_000, 2_000);
    const large = estimateCostUsd('gpt-4o-mini', 2_000, 4_000);
    expect(large?.costUsd).toBeGreaterThan(small?.costUsd ?? 0);
  });

  it('exposes pricing per model', () => {
    expect(getModelPricing('gpt-4o')?.inputPerMillionUsd).toBe(2.5);
    expect(getModelPricing('gpt-4o')?.outputPerMillionUsd).toBe(10);
    expect(getModelPricing('unknown')).toBeUndefined();
  });
});