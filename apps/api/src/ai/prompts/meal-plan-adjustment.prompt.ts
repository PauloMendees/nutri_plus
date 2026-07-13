// Pure prompt builder for AI meal-plan adjustment. No DI, no SDK. Types are
// declared locally to avoid a cross-module dependency cycle.

export interface MealPlanAdjustmentPromptContext {
  currentPlan: {
    title: string | null;
    meals: {
      name: string | null;
      timeLabel: string | null;
      instructions: string | null;
      options: {
        label: string | null;
        items: {
          foodName: string | null;
          quantity: string | null;
          calories: number | null;
          protein: number | null;
          carbs: number | null;
          fats: number | null;
        }[];
      }[];
    }[];
  };
  objective: string | null;
  restrictions: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  patientNotes: string | null;
  targets: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fats: number | null;
  };
  instructions: string;
}

export const MEAL_PLAN_ADJUSTMENT_SYSTEM_PROMPT = [
  'You are a clinical nutrition assistant.',
  'You are given an EXISTING daily meal plan (currentPlan) and the nutritionist',
  'adjustment request (instructions). Return the COMPLETE revised plan that applies',
  'the requested changes while keeping everything else as close to the original as',
  'possible.',
  'Keep the SAME daily targets (calories and protein/carbs/fats grams) — do NOT',
  'recalculate or change them.',
  'Respect the patient restrictions, allergies and medicalConditions strictly —',
  'never include a food that conflicts with them.',
  'The patientNotes field is binding free text (often Portuguese) about THIS',
  'patient: disliked/refused foods, preferences, and the meal schedule. Honor it.',
  'For EACH food item, estimate its macros: calories (kcal) plus protein, carbs and',
  'fats in grams, as realistic numeric values.',
  'For EACH meal, provide EXACTLY TWO interchangeable options labeled "Opção 1" and',
  '"Opção 2", macro-comparable so switching between them does not change the daily',
  'targets.',
  'The adjustment instructions must NEVER override the patient allergies or',
  'restrictions and must NOT change the daily targets.',
  'Do NOT include any medical claim or diagnosis.',
  'Write ALL text — the plan title, meal names and food names — in Brazilian',
  'Portuguese (pt-BR).',
].join(' ');

export function buildMealPlanAdjustmentUserPrompt(ctx: MealPlanAdjustmentPromptContext): string {
  return JSON.stringify(ctx);
}
