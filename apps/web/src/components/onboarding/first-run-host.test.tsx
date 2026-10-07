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
    expect(screen.queryByRole('heading', { name: 'Boas-vindas ao iNutri' })).not.toBeInTheDocument();
  });

  it('does not open the dialog when promptDismissedAt is set', () => {
    onboardingState.data = { promptDismissedAt: '2026-08-02T00:00:00Z', tours: [] };
    render(<FirstRunHost />);
    expect(screen.queryByRole('heading', { name: 'Boas-vindas ao iNutri' })).not.toBeInTheDocument();
  });

  it('opens the dialog when onboardedAt is set and tours are empty', () => {
    render(<FirstRunHost />);
    expect(screen.getByRole('heading', { name: 'Boas-vindas ao iNutri' })).toBeInTheDocument();
  });

  it('does not open the dialog when onboarding data is missing', () => {
    onboardingState.data = undefined;
    render(<FirstRunHost />);
    expect(screen.queryByRole('heading', { name: 'Boas-vindas ao iNutri' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { name: 'Boas-vindas ao iNutri' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { name: 'Boas-vindas ao iNutri' })).not.toBeInTheDocument();
  });

  it('PATCH-dismisses only from Pular apresentação', async () => {
    render(<FirstRunHost />);
    await userEvent.click(screen.getByRole('button', { name: 'Pular apresentação' }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  // Sem tutorial guiado: vai direto para o cadastro, e o paciente fica real.
  it('opens the new patient page and also dismisses the prompt', async () => {
    render(<FirstRunHost />);
    await userEvent.click(screen.getByRole('button', { name: 'Vamos lá!' }));
    await userEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar primeiro paciente' }));
    expect(push).toHaveBeenCalledWith('/patients/new');
    expect(screen.queryByRole('heading', { name: 'Comece por aqui' })).not.toBeInTheDocument();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
