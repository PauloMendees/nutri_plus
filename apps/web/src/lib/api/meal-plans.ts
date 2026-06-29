import type {
  CreateMealPlanRequest,
  MealPlan,
  MealPlanSummary,
  UpdateMealPlanRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch, browserApiDownload } from '@/lib/api/browser';

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

export async function downloadMealPlanPdf(id: string): Promise<void> {
  const blob = await browserApiDownload(`/meal-plans/${id}/pdf`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'plano-alimentar.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
