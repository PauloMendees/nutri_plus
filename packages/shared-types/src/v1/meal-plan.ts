// Dates are ISO strings over the wire; metric/target fields are nullable in storage.
export interface MealItem {
  id: string;
  mealId: string;
  foodName: string | null;
  quantity: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  order: number;
}

export interface Meal {
  id: string;
  mealPlanId: string;
  name: string | null;
  timeLabel: string | null;
  instructions: string | null;
  order: number;
  items: MealItem[];
}

export interface MealPlan {
  id: string;
  patientId: string;
  title: string | null;
  objective: string | null;
  aiGenerated: boolean;
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
}

export interface MealInput {
  name?: string;
  timeLabel?: string;
  instructions?: string;
  items?: MealItemInput[];
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
