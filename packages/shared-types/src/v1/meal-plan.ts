// Dates are ISO strings over the wire; metric/target fields are nullable in storage.
export interface MealItem {
  id: string;
  mealOptionId: string;
  foodName: string | null;
  quantity: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  foodId: string | null;
  grams: number | null;
  fiber: number | null;
  sodium: number | null;
  order: number;
}

export interface MealOption {
  id: string;
  mealId: string;
  label: string | null;
  order: number;
  items: MealItem[];
}

export interface Meal {
  id: string;
  mealPlanId: string;
  name: string | null;
  timeLabel: string | null;
  instructions: string | null;
  order: number;
  options: MealOption[];
}

export interface MealPlan {
  id: string;
  patientId: string;
  title: string | null;
  objective: string | null;
  aiGenerated: boolean;
  visibleToPatient: boolean;
  targetCalories: number | null;
  targetProtein: number | null;
  targetCarbs: number | null;
  targetFats: number | null;
  createdAt: string;
  updatedAt: string;
  meals: Meal[];
}

export type MealPlanSummary = Omit<MealPlan, 'meals'>;

export interface MealItemInput {
  foodName?: string;
  quantity?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  foodId?: string;
  grams?: number;
  fiber?: number;
  sodium?: number;
}

export interface MealOptionInput {
  label?: string;
  items?: MealItemInput[];
}

export interface MealInput {
  name?: string;
  timeLabel?: string;
  instructions?: string;
  options?: MealOptionInput[];
}

export interface CreateMealPlanRequest {
  patientId: string;
  title?: string;
  objective?: string;
  targetCalories?: number;
  targetProtein?: number;
  targetCarbs?: number;
  targetFats?: number;
  meals?: MealInput[];
}

export type UpdateMealPlanRequest = Omit<CreateMealPlanRequest, 'patientId'>;

export interface GenerateMealPlanRequest {
  patientId: string;
  instructions?: string;
}

export interface SetMealPlanVisibilityRequest {
  visibleToPatient: boolean;
}

export interface AdjustMealPlanRequest {
  planId: string;
  instructions: string;
}

// Unpersisted revision returned by POST /ai/adjust-meal-plan — shaped to
// repopulate the web meal-plan editor form. Targets/objective are carried from
// the existing plan; the nutritionist reviews and saves via the normal update.
export interface MealPlanDraft {
  title?: string;
  objective?: string;
  targetCalories?: number;
  targetProtein?: number;
  targetCarbs?: number;
  targetFats?: number;
  meals: MealInput[];
}
