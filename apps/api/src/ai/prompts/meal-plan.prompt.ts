// Pure prompt builder for meal-plan generation. No DI, no SDK. The consumer
// (meal-generation feature) imports these; types are declared locally to avoid a
// cross-module dependency cycle.

export interface MealPlanPromptContext {
  age: number;
  weightKg: number;
  heightCm: number;
  gender: string;
  objective: string;
  activityLevel: string;
  restrictions: string | null;
  allergies: string | null;
  targets: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
}

export const MEAL_PLAN_SYSTEM_PROMPT = [
  'You are a clinical nutrition assistant.',
  'Build a daily meal plan that meets the GIVEN daily targets (calories and',
  'protein/carbs/fats grams). The targets are already calculated for you — do',
  'NOT recalculate them and do not return any numeric values.',
  'Respect the patient restrictions and allergies strictly.',
  'Return meals in chronological order, each with realistic foods and amounts.',
].join(' ');

// The user prompt is the structured context as JSON. The provider sends it
// verbatim; never include free-form instructions here.
export function buildMealPlanUserPrompt(ctx: MealPlanPromptContext): string {
  return JSON.stringify(ctx);
}
