import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PatchOnboardingTourRequest } from '@nutri-plus/shared-types';
import {
  dismissOnboardingPrompt,
  getOnboarding,
  patchOnboardingTour,
} from '@/lib/api/onboarding';

export const ONBOARDING_KEY = ['onboarding'] as const;

export function useOnboarding() {
  return useQuery({ queryKey: ONBOARDING_KEY, queryFn: getOnboarding, staleTime: 30_000 });
}

export function useDismissOnboardingPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => dismissOnboardingPrompt(),
    onSuccess: (data) => {
      qc.setQueryData(ONBOARDING_KEY, data);
    },
  });
}

export function usePatchOnboardingTour() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tourId, body }: { tourId: string; body: PatchOnboardingTourRequest }) =>
      patchOnboardingTour(tourId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ONBOARDING_KEY }),
  });
}
