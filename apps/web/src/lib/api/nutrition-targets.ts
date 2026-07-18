import type { CreateNutritionTargetRequest, NutritionTarget } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listNutritionTargets(patientId: string): Promise<NutritionTarget[]> {
  return browserApiFetch<NutritionTarget[]>(`/patients/${patientId}/nutrition-targets`);
}

export function createNutritionTarget(
  patientId: string,
  body: CreateNutritionTargetRequest,
): Promise<NutritionTarget> {
  return browserApiFetch<NutritionTarget>(`/patients/${patientId}/nutrition-targets`, {
    method: 'POST',
    body,
  });
}
