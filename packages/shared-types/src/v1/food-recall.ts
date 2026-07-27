export interface RecallItem {
  id: string;
  recallMealId: string;
  foodName: string | null;
  quantity: string | null;
  grams: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  fiber: number | null;
  sodium: number | null;
  foodId: string | null;
  order: number;
}

export interface RecallMeal {
  id: string;
  foodRecallId: string;
  name: string | null;
  timeLabel: string | null;
  order: number;
  items: RecallItem[];
}

export interface FoodRecall {
  id: string;
  patientId: string;
  recallDate: string; // ISO
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  meals: RecallMeal[];
}

export type FoodRecallSummary = Omit<FoodRecall, 'meals'>;

export interface RecallItemInput {
  foodName?: string;
  quantity?: string;
  grams?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  fiber?: number;
  sodium?: number;
  foodId?: string;
}

export interface RecallMealInput {
  name?: string;
  timeLabel?: string;
  items?: RecallItemInput[];
}

export interface CreateFoodRecallRequest {
  patientId: string;
  recallDate?: string;
  notes?: string;
  meals?: RecallMealInput[];
}

export type UpdateFoodRecallRequest = Omit<CreateFoodRecallRequest, 'patientId'>;
