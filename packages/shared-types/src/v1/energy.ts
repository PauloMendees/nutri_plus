import { ActivityLevel, Gender, PatientObjective } from './patient';
import { TmbFormula } from './nutrition-target';

// Whole years between birthDate and `today` (default now).
export function ageFromBirthDate(
  birthDate: string | Date | null | undefined,
  today: Date = new Date(),
): number | null {
  if (!birthDate) return null;
  const d = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

// Katch requires body-fat %; without it the effective formula is Mifflin.
export function effectiveFormula(
  formula: TmbFormula,
  bodyFatPercentage: number | null | undefined,
): TmbFormula {
  return formula === TmbFormula.KATCH_MCARDLE && bodyFatPercentage == null
    ? TmbFormula.MIFFLIN
    : formula;
}

export interface TmbInput {
  formula: TmbFormula;
  sex: Gender; // MALE | FEMALE
  weightKg: number;
  heightCm: number;
  age: number;
  bodyFatPercentage?: number | null;
}

export function computeTmb(input: TmbInput): number {
  const { formula, sex, weightKg, heightCm, age, bodyFatPercentage } = input;
  const male = sex === Gender.MALE;
  const eff = effectiveFormula(formula, bodyFatPercentage);
  if (eff === TmbFormula.KATCH_MCARDLE) {
    const lbm = weightKg * (1 - (bodyFatPercentage as number) / 100);
    return 370 + 21.6 * lbm;
  }
  if (eff === TmbFormula.HARRIS_BENEDICT) {
    return male
      ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
      : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (male ? 5 : -161);
}

export function activityFactor(level: ActivityLevel): number {
  switch (level) {
    case ActivityLevel.SEDENTARY:
      return 1.2;
    case ActivityLevel.LIGHT:
      return 1.375;
    case ActivityLevel.MODERATE:
      return 1.55;
    case ActivityLevel.ACTIVE:
      return 1.725;
    case ActivityLevel.VERY_ACTIVE:
      return 1.9;
  }
}

export function computeGet(tmb: number, level: ActivityLevel): number {
  return tmb * activityFactor(level);
}

export function objectiveAdjustment(objective: PatientObjective | null | undefined): number {
  if (objective === PatientObjective.WEIGHT_LOSS) return -0.2;
  if (objective === PatientObjective.MUSCLE_GAIN) return 0.1;
  return 0; // MAINTENANCE, RECOMPOSITION, null
}

export function suggestedCalories(
  get: number,
  objective: PatientObjective | null | undefined,
): number {
  return get * (1 + objectiveAdjustment(objective));
}

export interface MacroInput {
  targetCalories: number;
  weightKg: number;
  proteinGramsPerKg: number;
  fatPercent: number;
}
export interface MacroResult {
  proteinGrams: number;
  proteinKcal: number;
  fatGrams: number;
  fatKcal: number;
  carbGrams: number;
  carbKcal: number;
}

export function computeMacros(input: MacroInput): MacroResult {
  const { targetCalories, weightKg, proteinGramsPerKg, fatPercent } = input;
  const proteinGrams = Math.round(proteinGramsPerKg * weightKg);
  const proteinKcal = proteinGrams * 4;
  const fatKcal = Math.round((targetCalories * fatPercent) / 100);
  const fatGrams = Math.round(fatKcal / 9);
  const carbKcal = Math.max(0, Math.round(targetCalories - proteinKcal - fatKcal));
  const carbGrams = Math.round(carbKcal / 4);
  return { proteinGrams, proteinKcal, fatGrams, fatKcal, carbGrams, carbKcal };
}
