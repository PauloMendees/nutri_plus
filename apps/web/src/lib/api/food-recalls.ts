import type {
  CreateFoodRecallRequest,
  FoodRecall,
  FoodRecallSummary,
  UpdateFoodRecallRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listFoodRecalls(patientId: string): Promise<FoodRecallSummary[]> {
  return browserApiFetch<FoodRecallSummary[]>(`/food-recalls?patientId=${patientId}`);
}

export function getFoodRecall(id: string): Promise<FoodRecall> {
  return browserApiFetch<FoodRecall>(`/food-recalls/${id}`);
}

export function createFoodRecall(body: CreateFoodRecallRequest): Promise<FoodRecall> {
  return browserApiFetch<FoodRecall>('/food-recalls', { method: 'POST', body });
}

export function updateFoodRecall(id: string, body: UpdateFoodRecallRequest): Promise<FoodRecall> {
  return browserApiFetch<FoodRecall>(`/food-recalls/${id}`, { method: 'PUT', body });
}

export function deleteFoodRecall(id: string): Promise<void> {
  return browserApiFetch<void>(`/food-recalls/${id}`, { method: 'DELETE' });
}
