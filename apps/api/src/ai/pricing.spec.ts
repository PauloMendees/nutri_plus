import { estimateCostUsd } from './pricing';

describe('estimateCostUsd', () => {
  it('computes prompt + completion cost for a known model', () => {
    // gpt-4o-mini: $0.15/M input, $0.60/M output
    const cost = estimateCostUsd('gpt-4o-mini', 1000, 2000);
    expect(cost).toBeCloseTo((1000 * 0.15 + 2000 * 0.6) / 1_000_000, 10);
  });

  it('returns null for an unknown model', () => {
    expect(estimateCostUsd('gpt-future', 1000, 2000)).toBeNull();
  });

  it('returns null when token counts are missing', () => {
    expect(estimateCostUsd('gpt-4o', undefined, 2000)).toBeNull();
    expect(estimateCostUsd('gpt-4o', 1000, undefined)).toBeNull();
  });
});
