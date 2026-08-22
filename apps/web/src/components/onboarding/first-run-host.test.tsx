import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OnboardingMeView } from '@nutri-plus/shared-types';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const onboardingState: { data: OnboardingMeView | undefined } = {
  data: { promptDismissedAt: null, tours: [] },
};
const dismiss = vi.fn();
vi.mock('@/lib/queries/onboarding', () => ({
  useOnboarding: () => ({ data: onboardingState.data }),
  useDismissOnboardingPrompt: () => ({ mutateAsync: dismiss }),
}));

const subscriptionState: { data: { onboardedAt: string | null } | undefined } = {
  data: { onboardedAt: '2026-08-01T00:00:00Z' },
};
vi.mock('@/lib/queries/subscription', () => ({
  useSubscription: () => ({ data: subscriptionState.data }),
}));

import { FirstRunHost } from './first-run-host';

beforeEach(() => {
  push.mockReset();
  dismiss.mockReset().mockResolvedValue({ promptDismissedAt: 'x', tours: [] });
  onboardingState.data = { promptDismissedAt: null, tours: [] };
  subscriptionState.data = { onboardedAt: '2026-08-01T00:00:00Z' };
});

describe('FirstRunHost', () => {
  it('does not open the dialog when onboardedAt is null', () => {
    subscriptionState.data = { onboardedAt: null };
    render(<FirstRunHost />);
    expect(screen.queryByRole('heading', { name: 'Conheça o iNutri' })).not.toBeInTheDocument();
  });

  it('does not open the dialog when promptDismissedAt is set', () => {
    onboardingState.data = { promptDismissedAt: '2026-08-02T00:00:00Z', tours: [] };
    render(<FirstRunHost />);
    expect(screen.queryByRole('heading', { name: 'Conheça o iNutri' })).not.toBeInTheDocument();
  });

  it('opens the dialog when onboardedAt is set and tours are empty', () => {
    render(<FirstRunHost />);
    expect(screen.getByRole('heading', { name: /primeiros passos no inutri/i })).toBeInTheDocument();
  });

  it('does not open the dialog when onboarding data is missing', () => {
    onboardingState.data = undefined;
    render(<FirstRunHost />);
    expect(screen.queryByRole('heading', { name: 'Conheça o iNutri' })).not.toBeInTheDocument();
  });

  it('does not open the dialog when a tour is IN_PROGRESS', () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        {
          tourId: 'patients',
          status: 'IN_PROGRESS',
          demoPatientId: null,
          completedAt: null,
          chapters: [],
        },
      ],
    };
    render(<FirstRunHost />);
    expect(screen.queryByRole('heading', { name: 'Conheça o iNutri' })).not.toBeInTheDocument();
  });

  it('does not open the dialog when a tour is COMPLETED', () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        {
          tourId: 'patients',
          status: 'COMPLETED',
          demoPatientId: 'p1',
          completedAt: '2026-08-03T00:00:00Z',
          chapters: [],
        },
      ],
    };
    render(<FirstRunHost />);
    expect(screen.queryByRole('heading', { name: 'Conheça o iNutri' })).not.toBeInTheDocument();
  });

  it('PATCH-dismisses only from Agora não', async () => {
    render(<FirstRunHost />);
    await userEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('navigates to primeiros passos without dismissing', async () => {
    render(<FirstRunHost />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver primeiros passos' }));
    expect(push).toHaveBeenCalledWith('/primeiros-passos');
    expect(dismiss).not.toHaveBeenCalled();
  });
});
