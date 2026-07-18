import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateNutritionTargetRequest } from '@nutri-plus/shared-types';
import { createNutritionTarget, listNutritionTargets } from '@/lib/api/nutrition-targets';

export function useNutritionTargets(patientId: string) {
  return useQuery({
    queryKey: ['nutrition-targets', patientId],
    queryFn: () => listNutritionTargets(patientId),
    enabled: Boolean(patientId),
  });
}

export function useCreateNutritionTarget(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateNutritionTargetRequest) => createNutritionTarget(patientId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition-targets', patientId] }),
  });
}
