import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateFoodRecallRequest, UpdateFoodRecallRequest } from '@nutri-plus/shared-types';
import {
  createFoodRecall,
  deleteFoodRecall,
  getFoodRecall,
  listFoodRecalls,
  updateFoodRecall,
} from '@/lib/api/food-recalls';

export function useFoodRecalls(patientId: string) {
  return useQuery({
    queryKey: ['food-recalls', patientId],
    queryFn: () => listFoodRecalls(patientId),
    enabled: Boolean(patientId),
  });
}

export function useFoodRecall(id: string) {
  return useQuery({
    queryKey: ['food-recall', id],
    queryFn: () => getFoodRecall(id),
    enabled: Boolean(id),
  });
}

export function useCreateFoodRecall(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFoodRecallRequest) => createFoodRecall(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['food-recalls', patientId] }),
  });
}

export function useUpdateFoodRecall(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateFoodRecallRequest }) =>
      updateFoodRecall(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['food-recalls', patientId] });
      qc.invalidateQueries({ queryKey: ['food-recall', data.id] });
    },
  });
}

export function useDeleteFoodRecall(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFoodRecall(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['food-recalls', patientId] }),
  });
}
