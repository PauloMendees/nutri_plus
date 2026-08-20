import { computeImc } from './imc';

describe('computeImc', () => {
  it('computes BMI rounded to 2 decimals', () => {
    // 70 / (1.70^2) = 24.2214... → 24.22
    expect(computeImc(170, 70)).toBe(24.22);
  });

  it('does not round 24.98 up to 25 (WHO overweight bound)', () => {
    // 68 / (1.65^2) = 24.977... → 24.98
    expect(computeImc(165, 68)).toBe(24.98);
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
