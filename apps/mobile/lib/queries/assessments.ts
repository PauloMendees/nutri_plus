import { useQuery } from '@tanstack/react-query';
import type { MyEvolutionResponse } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function getMyEvolution(): Promise<MyEvolutionResponse> {
  return apiFetch<MyEvolutionResponse>('/me/assessments');
}

export function useMyEvolution() {
  return useQuery({ queryKey: ['me', 'assessments'], queryFn: getMyEvolution });
}
