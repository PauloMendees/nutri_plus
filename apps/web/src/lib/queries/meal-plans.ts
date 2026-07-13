import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateMealPlanRequest, UpdateMealPlanRequest } from '@nutri-plus/shared-types';
import {
  adjustMealPlan,
  createMealPlan,
  deleteMealPlan,
  generateMealPlan,
  getMealPlan,
  listMealPlans,
  setMealPlanVisibility,
  updateMealPlan,
} from '@/lib/api/meal-plans';

export function useMealPlans(patientId: string) {
  return useQuery({
    queryKey: ['meal-plans', patientId],
    queryFn: () => listMealPlans(patientId),
    enabled: Boolean(patientId),
  });
}

export function useMealPlan(id: string) {
  return useQuery({
    queryKey: ['meal-plan', id],
    queryFn: () => getMealPlan(id),
    enabled: Boolean(id),
  });
}

export function useCreateMealPlan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMealPlanRequest) => createMealPlan(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal-plans', patientId] }),
  });
}

export function useUpdateMealPlan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMealPlanRequest }) =>
      updateMealPlan(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['meal-plans', patientId] });
      qc.invalidateQueries({ queryKey: ['meal-plan', data.id] });
    },
  });
}

export function useDeleteMealPlan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMealPlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal-plans', patientId] }),
  });
}

export function useSetMealPlanVisibility(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, visibleToPatient }: { id: string; visibleToPatient: boolean }) =>
      setMealPlanVisibility(id, visibleToPatient),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal-plans', patientId] }),
  });
}

export function useGenerateMealPlan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instructions?: string) => generateMealPlan(patientId, instructions),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal-plans', patientId] }),
  });
}

export function useAdjustMealPlan(planId: string) {
  return useMutation({
    mutationFn: (instructions: string) => adjustMealPlan(planId, instructions),
  });
}
