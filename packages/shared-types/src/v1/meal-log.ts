export type MealLogSource = 'PLAN' | 'FREE_TEXT';

export interface MealLogItemSnapshot {
  foodName: string | null;
  quantity: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  grams: number | null;
}

export interface MealLog {
  id: string;
  patientId: string;
  consumedAt: string;
  source: MealLogSource;
  note: string | null;
  freeText: string | null;
  mealName: string | null;
  mealTimeLabel: string | null;
  optionLabel: string | null;
  itemsJson: MealLogItemSnapshot[] | null;
  mealPlanId: string | null;
  mealId: string | null;
  mealOptionId: string | null;
  createdAt: string;
  updatedAt: string;
  editableUntil: string;
}

export interface CreateMealLogRequest {
  consumedAt: string;
  source: MealLogSource;
  note?: string;
  freeText?: string;
  mealOptionId?: string;
}

export type UpdateMealLogRequest = CreateMealLogRequest;
