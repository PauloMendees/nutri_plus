import type { ActivityLevel, Gender } from './patient';

export enum TmbFormula {
  MIFFLIN = 'MIFFLIN',
  HARRIS_BENEDICT = 'HARRIS_BENEDICT',
  KATCH_MCARDLE = 'KATCH_MCARDLE',
}

// Dates are ISO strings over the wire. `sex` is the biological sex used for the
// estimate (always MALE/FEMALE — resolved in the form when gender is OTHER/unspecified).
export interface NutritionTarget {
  id: string;
  patientId: string;
  targetDate: string;
  createdAt: string;
  formula: TmbFormula;
  sex: Gender;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  bodyFatPercentage: number | null;
  activityLevel: ActivityLevel | null;
  activityFactor: number;
  tmb: number;
  get: number;
  targetCalories: number;
  proteinGramsPerKg: number;
  proteinGrams: number;
  fatPercent: number;
  fatGrams: number;
  carbGrams: number;
}

export interface CreateNutritionTargetRequest {
  formula: TmbFormula;
  sex: Gender; // MALE | FEMALE
  age?: number;
  heightCm?: number;
  weightKg?: number;
  bodyFatPercentage?: number;
  activityLevel?: ActivityLevel;
  targetCalories: number;
  proteinGramsPerKg: number;
  fatPercent: number;
}
