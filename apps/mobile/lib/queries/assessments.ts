import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BodyAssessment, CreateAssessmentRequest, MyEvolutionResponse } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function getMyEvolution(): Promise<MyEvolutionResponse> {
  return apiFetch<MyEvolutionResponse>('/me/assessments');
}

export function useMyEvolution() {
  return useQuery({ queryKey: ['me', 'assessments'], queryFn: getMyEvolution });
}

export function useCreateMyAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAssessmentRequest) =>
      apiFetch<BodyAssessment>('/me/assessments', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'assessments'] });
    },
  });
}
