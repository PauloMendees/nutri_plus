import type { OnboardingMeView, PatchOnboardingTourRequest } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function getOnboarding(): Promise<OnboardingMeView> {
  return browserApiFetch<OnboardingMeView>('/me/onboarding');
}

export function dismissOnboardingPrompt(): Promise<OnboardingMeView> {
  return browserApiFetch<OnboardingMeView>('/me/onboarding', {
    method: 'PATCH',
    body: { promptDismissed: true },
  });
}

export function patchOnboardingTour(
  tourId: string,
  body: PatchOnboardingTourRequest,
): Promise<OnboardingMeView> {
  return browserApiFetch<OnboardingMeView>(`/me/onboarding/${tourId}`, {
    method: 'PATCH',
    body,
  });
}
