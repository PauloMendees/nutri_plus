import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({ browserApiFetch: (...a: unknown[]) => browserApiFetch(...a) }));

import { dismissOnboardingPrompt, getOnboarding, patchOnboardingTour } from './onboarding';
import { deleteDemoPatient } from './patients';

beforeEach(() => browserApiFetch.mockReset());

it('GET /me/onboarding', async () => {
  browserApiFetch.mockResolvedValue({ promptDismissedAt: null, tours: [] });
  await getOnboarding();
  expect(browserApiFetch).toHaveBeenCalledWith('/me/onboarding');
});

it('PATCH prompt and tour', async () => {
  browserApiFetch.mockResolvedValue({ promptDismissedAt: 'x', tours: [] });
  await dismissOnboardingPrompt();
  expect(browserApiFetch).toHaveBeenCalledWith('/me/onboarding', { method: 'PATCH', body: { promptDismissed: true } });
  await patchOnboardingTour('patients', { chapterId: 'lista', chapterStatus: 'COMPLETED' });
  expect(browserApiFetch).toHaveBeenCalledWith('/me/onboarding/patients', {
    method: 'PATCH',
    body: { chapterId: 'lista', chapterStatus: 'COMPLETED' },
  });
});

it('DELETE demo patient', async () => {
  browserApiFetch.mockResolvedValue(undefined);
  await deleteDemoPatient('p1');
  expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1', { method: 'DELETE' });
});
