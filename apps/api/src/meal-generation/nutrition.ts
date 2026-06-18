import {
  ActivityLevel,
  Gender,
  PatientObjective,
} from '../generated/prisma/client';

// --- Tunable constants (single source of truth) ---

// kcal multiplier applied to BMR by activity level.
export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

// Calorie adjustment applied to TDEE by objective.
export const OBJECTIVE_FACTOR: Record<PatientObjective, number> = {
  WEIGHT_LOSS: 0.8,
  MAINTENANCE: 1.0,
  RECOMPOSITION: 0.95,
  MUSCLE_GAIN: 1.1,
};

// Protein grams per kg bodyweight by objective.
export const PROTEIN_PER_KG: Record<PatientObjective, number> = {
  WEIGHT_LOSS: 2.0,
  MUSCLE_GAIN: 2.0,
  RECOMPOSITION: 2.0,
  MAINTENANCE: 1.6,
};

// Share of calories from fat.
export const FAT_PCT = 0.25;

// Mifflin-St Jeor sex constant. OTHER / PREFER_NOT_TO_SAY use the average of the
// male (+5) and female (-161) constants: -78.
const SEX_CONSTANT: Record<Gender, number> = {
  MALE: 5,
  FEMALE: -161,
  OTHER: -78,
  PREFER_NOT_TO_SAY: -78,
};

export interface NutritionInputs {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  objective: PatientObjective;
  activityLevel: ActivityLevel;
  measuredBmr?: number | null;
}

export interface NutritionTargets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

// Whole years between birthDate and now, accounting for whether the birthday has
// occurred yet this year.
export function computeAge(birthDate: Date, now: Date): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

// Measured bioimpedance BMR when present and positive; otherwise Mifflin-St Jeor.
export function computeBmr(i: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  measuredBmr?: number | null;
}): number {
  if (i.measuredBmr && i.measuredBmr > 0) {
    return i.measuredBmr;
  }
  return 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age + SEX_CONSTANT[i.gender];
}

export function computeTargets(i: NutritionInputs): NutritionTargets {
  const bmr = computeBmr(i);
  const tdee = bmr * ACTIVITY_FACTOR[i.activityLevel];
  const calories = Math.round(tdee * OBJECTIVE_FACTOR[i.objective]);
  const protein = Math.round(PROTEIN_PER_KG[i.objective] * i.weightKg);
  const fats = Math.round((calories * FAT_PCT) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fats * 9) / 4));
  return { calories, protein, carbs, fats };
}
