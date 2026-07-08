import { useMutation } from '@tanstack/react-query';
import type { CreateOutsideHomeRequest, OutsideHomeSuggestion } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function useOutsideHome() {
  return useMutation({
    mutationFn: (body: CreateOutsideHomeRequest) =>
      apiFetch<OutsideHomeSuggestion>('/me/outside-home', { method: 'POST', body }),
  });
}
