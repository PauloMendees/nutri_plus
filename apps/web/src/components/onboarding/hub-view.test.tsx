import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  UserRole,
  type Entitlements,
  type OnboardingMeView,
  type OnboardingTourProgressView,
} from '@nutri-plus/shared-types';

const start = vi.fn();
vi.mock('./tour-provider', () => ({
  useTour: () => ({
    start,
    exit: () => {},
    skipChapter: () => {},
    isPlayCadastroSubmit: () => false,
  }),
}));

const onboardingState: { data: OnboardingMeView | undefined } = {
  data: { promptDismissedAt: null, tours: [] },
};
vi.mock('@/lib/queries/onboarding', () => ({
  useOnboarding: () => ({ data: onboardingState.data }),
}));

const pro: Entitlements = {
  isReadOnly: false,
  aiQuota: 200,
  aiUsed: 1,
  tier: 'PRO',
  features: { silhueta: true, transcription: true, employees: true },
};
const exhausted: Entitlements = { ...pro, aiUsed: 200 };

const subscriptionState: { data: { entitlements?: Entitlements } | undefined } = {
  data: { entitlements: pro },
};
vi.mock('@/lib/queries/subscription', () => ({
  useSubscription: () => ({ data: subscriptionState.data }),
}));
vi.mock('@/lib/queries/patients', () => ({
  useDeleteDemoPatient: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { HubView } from './hub-view';

function tour(partial: Partial<OnboardingTourProgressView> = {}): OnboardingTourProgressView {
  return {
    tourId: 'patients',
    status: 'IN_PROGRESS',
    demoPatientId: null,
    completedAt: null,
    chapters: [],
    ...partial,
  };
}

function chapter(
  chapterId: string,
  status: OnboardingTourProgressView['chapters'][number]['status'],
) {
  return { chapterId, status, furthestStepId: null, completedAt: status === 'IN_PROGRESS' ? null : 'x' };
}

beforeEach(() => {
  start.mockReset();
  onboardingState.data = { promptDismissedAt: null, tours: [] };
  subscriptionState.data = { entitlements: pro };
});

describe('HubView', () => {
  it('shows Começar for a nutritionist with empty progress', () => {
    render(<HubView role={UserRole.NUTRITIONIST} />);
    expect(screen.getByRole('button', { name: /começar/i })).toBeEnabled();
  });

  it('starts the first eligible chapter from Começar', async () => {
    render(<HubView role={UserRole.NUTRITIONIST} />);
    await userEvent.click(screen.getByRole('button', { name: /começar/i }));
    expect(start).toHaveBeenCalledWith({ tourId: 'patients', chapterId: 'lista', replay: false });
  });

  it('shows Continuar when the tour is IN_PROGRESS', () => {
    onboardingState.data = { promptDismissedAt: null, tours: [tour({ status: 'IN_PROGRESS' })] };
    render(<HubView role={UserRole.NUTRITIONIST} />);
    expect(screen.getByRole('button', { name: /continuar/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /começar/i })).not.toBeInTheDocument();
  });

  it('continues from the first incomplete eligible chapter', async () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        tour({
          status: 'IN_PROGRESS',
          chapters: [chapter('lista', 'COMPLETED')],
        }),
      ],
    };
    render(<HubView role={UserRole.NUTRITIONIST} />);
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(start).toHaveBeenCalledWith({ tourId: 'patients', chapterId: 'cadastro', replay: false });
  });

  it('shows Concluído and Rever when the tour is COMPLETED', () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        tour({
          status: 'COMPLETED',
          completedAt: 'x',
          demoPatientId: 'p1',
          chapters: [chapter('lista', 'COMPLETED')],
        }),
      ],
    };
    render(<HubView role={UserRole.NUTRITIONIST} />);
    expect(screen.getByText('Concluído', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^rever$/i }).length).toBeGreaterThan(0);
  });

  it('shows the delete-demo banner when demoPatientId is set', () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [tour({ status: 'IN_PROGRESS', demoPatientId: 'p1' })],
    };
    render(<HubView role={UserRole.NUTRITIONIST} />);
    expect(screen.getByText('Este é um paciente de demonstração.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apagar paciente de demonstração' })).toBeInTheDocument();
  });

  it('replays a completed chapter from Rever', async () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        tour({
          status: 'COMPLETED',
          completedAt: 'x',
          demoPatientId: 'p1',
          chapters: [chapter('lista', 'COMPLETED')],
        }),
      ],
    };
    render(<HubView role={UserRole.NUTRITIONIST} />);
    const row = screen.getByText('Lista').closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: /^rever$/i }));
    expect(start).toHaveBeenCalledWith({ tourId: 'patients', chapterId: 'lista', replay: true });
  });

  it('disables Começar for an employee and shows the helper text', () => {
    render(<HubView role={UserRole.EMPLOYEE} />);
    expect(screen.getByRole('button', { name: /começar/i })).toBeDisabled();
    expect(
      screen.getByText('Este tutorial é feito pelo nutricionista (cadastro de pacientes).'),
    ).toBeInTheDocument();
  });

  it('does not call start when an employee clicks Começar', async () => {
    render(<HubView role={UserRole.EMPLOYEE} />);
    await userEvent.click(screen.getByRole('button', { name: /começar/i }));
    expect(start).not.toHaveBeenCalled();
  });

  it('labels the IA chapter as locked when quota is exhausted', () => {
    subscriptionState.data = { entitlements: exhausted };
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [tour({ status: 'IN_PROGRESS', demoPatientId: 'p1' })],
    };
    render(<HubView role={UserRole.NUTRITIONIST} />);
    const row = screen.getByText('Gerar com IA').closest('li')!;
    expect(row).toHaveTextContent(/cadeado/i);
    expect(row).toHaveTextContent(/pro|cota|assinatura/i);
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/assinatura');
  });

  it('does not offer Rever on a demo-locked chapter', () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        tour({
          status: 'COMPLETED',
          completedAt: 'x',
          demoPatientId: null,
          chapters: [chapter('lista', 'COMPLETED'), chapter('ficha', 'COMPLETED')],
        }),
      ],
    };
    render(<HubView role={UserRole.NUTRITIONIST} />);
    const row = screen.getByText('Ficha').closest('li')!;
    expect(within(row).queryByRole('button', { name: /^rever$/i })).not.toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });
});
