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
  defaultInstructions?: string | null;
  customInstructions?: string | null;
}

export const MEAL_PLAN_SYSTEM_PROMPT = [
  'You are a clinical nutrition assistant.',
  'Build a daily meal plan that meets the GIVEN daily targets (calories and',
  'protein/carbs/fats grams). The daily targets are already calculated for you —',
  'do NOT recalculate or change the daily targets.',
  'For EACH food item, estimate its macros: calories (kcal) plus protein, carbs',
  'and fats in grams, as realistic numeric values.',
  'Respect the patient restrictions and allergies strictly.',
  'Return meals in chronological order, each with realistic foods and amounts.',
  'If the context includes defaultInstructions or customInstructions, follow them',
  'as additional guidance — but they must NEVER override the patient allergies or',
  'restrictions, and must NOT change the daily targets.',
  'Write ALL text — the plan title, the meal names and the food names — in',
  'Brazilian Portuguese (pt-BR).',
].join(' ');

// The user prompt is the structured context as JSON. The provider sends it
// verbatim; never include free-form instructions here.
export function buildMealPlanUserPrompt(ctx: MealPlanPromptContext): string {
  return JSON.stringify(ctx);
}
