import {
  ONBOARDING_TOUR_IDS,
  type CreatePatientRequest,
  type OnboardingMeView,
  type PatientSummary,
} from '@nutri-plus/shared-types';

describe('onboarding shared-types', () => {
  it('exposes only the patients tour in cycle 1', () => {
    expect(ONBOARDING_TOUR_IDS).toEqual(['patients']);
  });

  it('shapes Me view and demo flag', () => {
    const view: OnboardingMeView = {
      promptDismissedAt: null,
      tours: [
        {
          tourId: 'patients',
          status: 'IN_PROGRESS',
          demoPatientId: 'p1',
          completedAt: null,
          chapters: [
            {
              chapterId: 'cadastro',
              status: 'COMPLETED',
              furthestStepId: 'save',
              completedAt: '2026-08-21T00:00:00.000Z',
            },
          ],
        },
      ],
    };
    expect(view.tours[0].tourId).toBe('patients');
    const req: CreatePatientRequest = { name: 'Maria Demonstração', email: 'demo.u1.1@example.com', demo: true };
    expect(req.demo).toBe(true);
    const summary = { isDemo: true } as PatientSummary;
    expect(summary.isDemo).toBe(true);
  });
});
