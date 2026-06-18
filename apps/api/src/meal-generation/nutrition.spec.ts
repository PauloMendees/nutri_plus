import { computeAge, computeBmr, computeTargets } from './nutrition';

describe('computeAge', () => {
  it('returns whole years when the birthday has passed this year', () => {
    expect(computeAge(new Date('1990-06-10'), new Date('2026-06-17'))).toBe(36);
  });

  it('subtracts a year when the birthday has not been reached yet', () => {
    expect(computeAge(new Date('1990-06-20'), new Date('2026-06-17'))).toBe(35);
  });

  it('is timezone-stable at a UTC year boundary', () => {
    expect(computeAge(new Date('2000-01-01T00:00:00Z'), new Date('2024-01-01T00:00:00Z'))).toBe(24);
  });
});

describe('computeBmr', () => {
  it('uses Mifflin-St Jeor with +5 for MALE', () => {
    expect(
      computeBmr({ weightKg: 80, heightCm: 180, age: 30, gender: 'MALE' }),
    ).toBe(1780);
  });

  it('uses -161 for FEMALE', () => {
    expect(
      computeBmr({ weightKg: 60, heightCm: 165, age: 40, gender: 'FEMALE' }),
    ).toBeCloseTo(1270.25, 2);
  });

  it('uses -78 for OTHER / PREFER_NOT_TO_SAY', () => {
    expect(
      computeBmr({ weightKg: 70, heightCm: 170, age: 25, gender: 'OTHER' }),
    ).toBeCloseTo(1559.5, 2);
  });

  it('uses -78 for PREFER_NOT_TO_SAY (same as OTHER)', () => {
    expect(
      computeBmr({ weightKg: 70, heightCm: 170, age: 25, gender: 'PREFER_NOT_TO_SAY' }),
    ).toBeCloseTo(1559.5, 2);
  });

  it('prefers a measured BMR over the formula', () => {
    expect(
      computeBmr({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        gender: 'MALE',
        measuredBmr: 1500,
      }),
    ).toBe(1500);
  });

  it('falls back to the formula when measuredBmr is null or 0', () => {
    expect(
      computeBmr({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        gender: 'MALE',
        measuredBmr: null,
      }),
    ).toBe(1780);
    expect(
      computeBmr({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        gender: 'MALE',
        measuredBmr: 0,
      }),
    ).toBe(1780);
  });
});

describe('computeTargets', () => {
  it('computes calories and macros for a MALE weight-loss case (formula BMR)', () => {
    const t = computeTargets({
      weightKg: 80,
      heightCm: 180,
      age: 30,
      gender: 'MALE',
      objective: 'WEIGHT_LOSS',
      activityLevel: 'MODERATE',
      measuredBmr: null,
    });
    // BMR 1780 * 1.55 = 2759; * 0.80 = 2207
    expect(t.calories).toBe(2207);
    expect(t.protein).toBe(160); // 2.0 g/kg * 80
    expect(t.fats).toBe(61); // round(2207*0.25/9)
    expect(t.carbs).toBe(255); // round((2207 - 640 - 549)/4)
  });

  it('uses the maintenance protein factor (1.6 g/kg) and a measured BMR', () => {
    const t = computeTargets({
      weightKg: 70,
      heightCm: 175,
      age: 35,
      gender: 'MALE',
      objective: 'MAINTENANCE',
      activityLevel: 'SEDENTARY',
      measuredBmr: 1500,
    });
    // 1500 * 1.2 = 1800; * 1.0 = 1800
    expect(t.calories).toBe(1800);
    expect(t.protein).toBe(112); // 1.6 * 70
    expect(t.fats).toBe(50); // round(1800*0.25/9)
    expect(t.carbs).toBe(226); // round((1800 - 448 - 450)/4)
  });

  it('floors carbs at 0 when protein+fat exceed the calorie budget', () => {
    const t = computeTargets({
      weightKg: 100,
      heightCm: 170,
      age: 30,
      gender: 'MALE',
      objective: 'WEIGHT_LOSS',
      activityLevel: 'SEDENTARY',
      measuredBmr: 500,
    });
    // 500 * 1.2 = 600; * 0.8 = 480 cal; protein 200g -> 800 cal alone
    expect(t.carbs).toBe(0);
  });
});
