import type {
  CreateMealPlanRequest,
  MealPlan,
  MealPlanSummary,
  UpdateMealPlanRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listMealPlans(patientId: string): Promise<MealPlanSummary[]> {
  return browserApiFetch<MealPlanSummary[]>(`/meal-plans?patientId=${patientId}`);
}

export function getMealPlan(id: string): Promise<MealPlan> {
  return browserApiFetch<MealPlan>(`/meal-plans/${id}`);
}

export function createMealPlan(body: CreateMealPlanRequest): Promise<MealPlan> {
  return browserApiFetch<MealPlan>('/meal-plans', { method: 'POST', body });
}

export function updateMealPlan(id: string, body: UpdateMealPlanRequest): Promise<MealPlan> {
  return browserApiFetch<MealPlan>(`/meal-plans/${id}`, { method: 'PATCH', body });
}

export function deleteMealPlan(id: string): Promise<void> {
  return browserApiFetch<void>(`/meal-plans/${id}`, { method: 'DELETE' });
}

export function generateMealPlan(patientId: string, instructions?: string): Promise<MealPlan> {
  return browserApiFetch<MealPlan>('/ai/generate-meal-plan', {
    method: 'POST',
    body: { patientId, instructions },
  });
}
