import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyConsentStatus } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function getMyConsent(): Promise<MyConsentStatus> {
  return apiFetch<MyConsentStatus>('/me/consent');
}

export function useMyConsent(enabled = true) {
  return useQuery({ queryKey: ['me', 'consent'], queryFn: getMyConsent, enabled });
}

export function useAcceptConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policyVersion: string) =>
      apiFetch<MyConsentStatus>('/me/consent', { method: 'POST', body: { policyVersion } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'consent'] }),
  });
}
