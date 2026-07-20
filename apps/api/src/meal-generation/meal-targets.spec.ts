import {
  computeAge,
  computeBmr,
  computeTargets,
  Gender,
  PatientObjective,
  ActivityLevel,
} from '@nutri-plus/shared-types';

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
    expect(computeBmr({ weightKg: 80, heightCm: 180, age: 30, gender: Gender.MALE })).toBe(1780);
  });
  it('uses -161 for FEMALE', () => {
    expect(computeBmr({ weightKg: 60, heightCm: 165, age: 40, gender: Gender.FEMALE })).toBeCloseTo(1270.25, 2);
  });
  it('uses -78 for OTHER', () => {
    expect(computeBmr({ weightKg: 70, heightCm: 170, age: 25, gender: Gender.OTHER })).toBeCloseTo(1559.5, 2);
  });
  it('uses -78 for PREFER_NOT_TO_SAY (same as OTHER)', () => {
    expect(computeBmr({ weightKg: 70, heightCm: 170, age: 25, gender: Gender.PREFER_NOT_TO_SAY })).toBeCloseTo(1559.5, 2);
  });
  it('prefers a measured BMR over the formula', () => {
    expect(computeBmr({ weightKg: 80, heightCm: 180, age: 30, gender: Gender.MALE, measuredBmr: 1500 })).toBe(1500);
  });
  it('falls back to the formula when measuredBmr is null or 0', () => {
    expect(computeBmr({ weightKg: 80, heightCm: 180, age: 30, gender: Gender.MALE, measuredBmr: null })).toBe(1780);
    expect(computeBmr({ weightKg: 80, heightCm: 180, age: 30, gender: Gender.MALE, measuredBmr: 0 })).toBe(1780);
  });
});

describe('computeTargets', () => {
  it('computes calories and macros for a MALE weight-loss case (formula BMR)', () => {
    const t = computeTargets({
      weightKg: 80, heightCm: 180, age: 30,
      gender: Gender.MALE, objective: PatientObjective.WEIGHT_LOSS, activityLevel: ActivityLevel.MODERATE,
      measuredBmr: null,
    });
    expect(t.calories).toBe(2207);
    expect(t.protein).toBe(160);
    expect(t.fats).toBe(61);
    expect(t.carbs).toBe(255);
  });
  it('uses the maintenance protein factor (1.6 g/kg) and a measured BMR', () => {
    const t = computeTargets({
      weightKg: 70, heightCm: 175, age: 35,
      gender: Gender.MALE, objective: PatientObjective.MAINTENANCE, activityLevel: ActivityLevel.SEDENTARY,
      measuredBmr: 1500,
    });
    expect(t.calories).toBe(1800);
    expect(t.protein).toBe(112);
    expect(t.fats).toBe(50);
    expect(t.carbs).toBe(226);
  });
  it('floors carbs at 0 when protein+fat exceed the calorie budget', () => {
    const t = computeTargets({
      weightKg: 100, heightCm: 170, age: 30,
      gender: Gender.MALE, objective: PatientObjective.WEIGHT_LOSS, activityLevel: ActivityLevel.SEDENTARY,
      measuredBmr: 500,
    });
    expect(t.carbs).toBe(0);
  });
});
