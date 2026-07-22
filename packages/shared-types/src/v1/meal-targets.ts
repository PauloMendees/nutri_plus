import { ActivityLevel, Gender, PatientObjective } from './patient';
import { activityFactor } from './energy';

// Ajuste calórico aplicado ao TDEE por objetivo.
export const OBJECTIVE_FACTOR: Record<PatientObjective, number> = {
  WEIGHT_LOSS: 0.8,
  MAINTENANCE: 1.0,
  RECOMPOSITION: 0.95,
  MUSCLE_GAIN: 1.1,
};

// Proteína (g/kg) por objetivo.
export const PROTEIN_PER_KG: Record<PatientObjective, number> = {
  WEIGHT_LOSS: 2.0,
  MUSCLE_GAIN: 2.0,
  RECOMPOSITION: 2.0,
  MAINTENANCE: 1.6,
};

// Fração das calorias vinda de gordura.
export const FAT_PCT = 0.25;

// Constante de sexo do Mifflin-St Jeor. OTHER / PREFER_NOT_TO_SAY usam a média das
// constantes masculina (+5) e feminina (-161): -78.
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

// Anos inteiros entre birthDate e now (UTC-estável).
export function computeAge(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age;
}

// BMR de bioimpedância quando presente e positivo; senão Mifflin-St Jeor.
export function computeBmr(i: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  measuredBmr?: number | null;
}): number {
  if (i.measuredBmr != null && i.measuredBmr > 0) {
    return i.measuredBmr;
  }
  return 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age + SEX_CONSTANT[i.gender];
}

export function computeTargets(i: NutritionInputs): NutritionTargets {
  const bmr = computeBmr(i);
  const tdee = bmr * activityFactor(i.activityLevel);
  const calories = Math.round(tdee * OBJECTIVE_FACTOR[i.objective]);
  const protein = Math.round(PROTEIN_PER_KG[i.objective] * i.weightKg);
  const fats = Math.round((calories * FAT_PCT) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fats * 9) / 4));
  return { calories, protein, carbs, fats };
}
