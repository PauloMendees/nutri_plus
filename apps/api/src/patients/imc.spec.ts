import { computeImc } from './imc';

describe('computeImc', () => {
  it('computes BMI rounded to 1 decimal', () => {
    // 70 / (1.70^2) = 24.2214... → 24.2
    expect(computeImc(170, 70)).toBe(24.2);
  });

  it('returns null when height is missing or non-positive', () => {
    expect(computeImc(null, 70)).toBeNull();
    expect(computeImc(0, 70)).toBeNull();
  });

  it('returns null when weight is missing or non-positive', () => {
    expect(computeImc(170, null)).toBeNull();
    expect(computeImc(170, 0)).toBeNull();
  });
});
