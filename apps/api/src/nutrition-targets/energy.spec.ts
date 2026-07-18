import {
  computeTmb,
  computeGet,
  suggestedCalories,
  computeMacros,
  effectiveFormula,
} from '@nutri-plus/shared-types';
import { ActivityLevel, Gender, PatientObjective, TmbFormula } from '@nutri-plus/shared-types';

describe('energy calc', () => {
  it('Mifflin (male 80kg/180cm/30y) = 1780', () => {
    expect(
      computeTmb({ formula: TmbFormula.MIFFLIN, sex: Gender.MALE, weightKg: 80, heightCm: 180, age: 30 }),
    ).toBeCloseTo(1780, 5);
  });
  it('Mifflin female subtracts 161', () => {
    expect(
      computeTmb({ formula: TmbFormula.MIFFLIN, sex: Gender.FEMALE, weightKg: 80, heightCm: 180, age: 30 }),
    ).toBeCloseTo(1614, 5);
  });
  it('Katch (80kg, 20% fat) = 1752.4', () => {
    expect(
      computeTmb({ formula: TmbFormula.KATCH_MCARDLE, sex: Gender.MALE, weightKg: 80, heightCm: 180, age: 30, bodyFatPercentage: 20 }),
    ).toBeCloseTo(1752.4, 4);
  });
  it('Katch without body-fat% falls back to Mifflin', () => {
    expect(effectiveFormula(TmbFormula.KATCH_MCARDLE, null)).toBe(TmbFormula.MIFFLIN);
    expect(
      computeTmb({ formula: TmbFormula.KATCH_MCARDLE, sex: Gender.MALE, weightKg: 80, heightCm: 180, age: 30, bodyFatPercentage: null }),
    ).toBeCloseTo(1780, 5);
  });
  it('GET moderate = TMB*1.55; weight-loss suggestion = GET*0.8', () => {
    const get = computeGet(1780, ActivityLevel.MODERATE);
    expect(get).toBeCloseTo(2759, 5);
    expect(suggestedCalories(get, PatientObjective.WEIGHT_LOSS)).toBeCloseTo(2207.2, 4);
  });
  it('macros: 2000 kcal, 80kg, 1.8 g/kg, 25% fat → P144/F56/C231', () => {
    expect(computeMacros({ targetCalories: 2000, weightKg: 80, proteinGramsPerKg: 1.8, fatPercent: 25 })).toEqual({
      proteinGrams: 144,
      proteinKcal: 576,
      fatGrams: 56,
      fatKcal: 500,
      carbGrams: 231,
      carbKcal: 924,
    });
  });
});
