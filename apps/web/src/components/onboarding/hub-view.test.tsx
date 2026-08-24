import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    isPlayDemoSubmit: () => false,
    notifyChapterActionSucceeded: () => Promise.resolve(),
  }),
}));

const onboardingState: { data: OnboardingMeView | undefined } = {
  data: { promptDismissedAt: null, tours: [] },
};
vi.mock('@/lib/queries/onboarding', () => ({
  useOnboarding: () => ({ data: onboardingState.data }),
  ONBOARDING_KEY: ['onboarding'],
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
const deleteAppointment = vi.fn();
vi.mock('@/lib/queries/appointments', () => ({
  useDeleteAppointment: () => ({ mutateAsync: deleteAppointment, isPending: false }),
}));
const deleteTransaction = vi.fn();
vi.mock('@/lib/queries/transactions', () => ({
  useDeleteTransaction: () => ({ mutateAsync: deleteTransaction, isPending: false }),
}));

import { HubView } from './hub-view';

function tour(partial: Partial<OnboardingTourProgressView> = {}): OnboardingTourProgressView {
  return {
    tourId: 'patients',
    status: 'IN_PROGRESS',
    demoPatientId: null,
    demoAppointmentId: null,
    demoTransactionId: null,
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

function renderHub(role: UserRole | null = UserRole.NUTRITIONIST) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HubView role={role} />
    </QueryClientProvider>,
  );
}

function card(id: string) {
  return within(screen.getByTestId(`tour-card-${id}`));
}

beforeEach(() => {
  start.mockReset();
  deleteAppointment.mockReset();
  deleteTransaction.mockReset();
  onboardingState.data = { promptDismissedAt: null, tours: [] };
  subscriptionState.data = { entitlements: pro };
});

describe('HubView', () => {
  it('shows Começar for a nutritionist with empty progress', () => {
    renderHub(UserRole.NUTRITIONIST);
    expect(card('patients').getByRole('button', { name: /começar/i })).toBeEnabled();
  });

  it('starts the first eligible chapter from Começar', async () => {
    renderHub(UserRole.NUTRITIONIST);
    await userEvent.click(card('patients').getByRole('button', { name: /começar/i }));
    expect(start).toHaveBeenCalledWith({ tourId: 'patients', chapterId: 'lista', replay: false });
  });

  it('shows Continuar when the tour is IN_PROGRESS', () => {
    onboardingState.data = { promptDismissedAt: null, tours: [tour({ status: 'IN_PROGRESS' })] };
    renderHub(UserRole.NUTRITIONIST);
    expect(card('patients').getByRole('button', { name: /continuar/i })).toBeEnabled();
    expect(card('patients').queryByRole('button', { name: /começar/i })).not.toBeInTheDocument();
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
    renderHub(UserRole.NUTRITIONIST);
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
    renderHub(UserRole.NUTRITIONIST);
    expect(screen.getByText('Concluído', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^rever$/i }).length).toBeGreaterThan(0);
    const footer = screen.getByText('Concluído', { selector: '[data-slot="badge"]' }).closest(
      '[data-slot="card-footer"]',
    )!;
    expect(within(footer).getByRole('button', { name: /^rever$/i })).toHaveClass('ml-auto');
  });

  it('shows the delete-demo banner when demoPatientId is set', () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [tour({ status: 'IN_PROGRESS', demoPatientId: 'p1' })],
    };
    renderHub(UserRole.NUTRITIONIST);
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
    renderHub(UserRole.NUTRITIONIST);
    const row = screen.getByText('Lista').closest('[data-chapter="lista"]')!;
    await userEvent.click(within(row).getByRole('button', { name: /^rever$/i }));
    expect(start).toHaveBeenCalledWith({ tourId: 'patients', chapterId: 'lista', replay: true });
  });

  it('disables Começar for an employee and shows the helper text', () => {
    renderHub(UserRole.EMPLOYEE);
    expect(card('patients').getByRole('button', { name: /começar/i })).toBeDisabled();
    expect(
      card('patients').getByText('Este tutorial é feito pelo nutricionista (cadastro de pacientes).'),
    ).toBeInTheDocument();
  });

  it('does not call start when an employee clicks Começar', async () => {
    renderHub(UserRole.EMPLOYEE);
    await userEvent.click(card('patients').getByRole('button', { name: /começar/i }));
    expect(start).not.toHaveBeenCalled();
  });

  it('labels the IA chapter as locked when quota is exhausted', () => {
    subscriptionState.data = { entitlements: exhausted };
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [tour({ status: 'IN_PROGRESS', demoPatientId: 'p1' })],
    };
    renderHub(UserRole.NUTRITIONIST);
    const row = screen.getByText('Gerar com IA').closest('[data-chapter="gerar-ia"]')!;
    expect(row).toHaveTextContent(/bloqueado/i);
    expect(row).not.toHaveTextContent(/cadeado/i);
    expect(within(row).getByRole('button', { name: /iniciar gerar com ia/i })).toBeDisabled();
  });

  it('starts cadastro play to recreate a demo when cadastro is COMPLETED and demoPatientId is null', async () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        tour({
          status: 'IN_PROGRESS',
          demoPatientId: null,
          chapters: [chapter('lista', 'COMPLETED'), chapter('cadastro', 'COMPLETED')],
        }),
      ],
    };
    renderHub(UserRole.NUTRITIONIST);
    expect(screen.getByRole('button', { name: /continuar/i })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(start).toHaveBeenCalledWith({ tourId: 'patients', chapterId: 'cadastro', replay: false });
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
    renderHub(UserRole.NUTRITIONIST);
    const row = screen.getByText('Ficha').closest('[data-chapter="ficha"]')!;
    expect(within(row).queryByRole('button', { name: /^rever$/i })).not.toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });

  it('starts a chapter from its play control', async () => {
    renderHub(UserRole.NUTRITIONIST);
    await userEvent.click(screen.getByRole('button', { name: /iniciar lista/i }));
    expect(start).toHaveBeenCalledWith({ tourId: 'patients', chapterId: 'lista', replay: false });
  });

  it('explains a locked chapter in a tooltip', async () => {
    subscriptionState.data = { entitlements: exhausted };
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [tour({ status: 'IN_PROGRESS', demoPatientId: 'p1' })],
    };
    renderHub(UserRole.NUTRITIONIST);
    await userEvent.hover(screen.getByText('Bloqueado'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/cota de ia esgotada/i);
  });

  it('renders the five tour cards in sidebar order', () => {
    renderHub(UserRole.NUTRITIONIST);
    const titles = ['Pacientes', 'Agenda', 'Contabilidade', 'Alimentos', 'Configurações'];
    const cards = screen.getAllByTestId(/tour-card-/);
    expect(cards).toHaveLength(5);
    titles.forEach((title, i) => expect(cards[i]).toHaveTextContent(title));
  });

  it('lets an employee start Agenda but not Configurações', async () => {
    renderHub(UserRole.EMPLOYEE);
    expect(card('agenda').getByRole('button', { name: /começar/i })).toBeEnabled();
    await userEvent.click(card('agenda').getByRole('button', { name: /começar/i }));
    expect(start).toHaveBeenCalledWith({ tourId: 'agenda', chapterId: 'visao-geral', replay: false });
    expect(card('configuracoes').getByRole('button', { name: /começar/i })).toBeDisabled();
    expect(
      card('configuracoes').getByText('Este tutorial é feito pelo nutricionista (configurações da conta).'),
    ).toBeInTheDocument();
  });

  it('shows the demo appointment banner and deletes through it', async () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        tour({
          tourId: 'agenda',
          status: 'COMPLETED',
          completedAt: 'x',
          demoAppointmentId: 'apt-1',
          chapters: [chapter('agendamento', 'COMPLETED')],
        }),
      ],
    };
    renderHub(UserRole.NUTRITIONIST);
    expect(card('agenda').getByText('Este é um agendamento de demonstração.')).toBeInTheDocument();
    await userEvent.click(card('agenda').getByRole('button', { name: 'Apagar agendamento de demonstração' }));
    await userEvent.click(card('agenda').getByRole('button', { name: 'Confirmar exclusão' }));
    expect(deleteAppointment).toHaveBeenCalledWith('apt-1');
  });

  it('shows the demo transaction banner when the ref is set', () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        tour({
          tourId: 'contabilidade',
          status: 'IN_PROGRESS',
          demoTransactionId: 'tx-1',
        }),
      ],
    };
    renderHub(UserRole.NUTRITIONIST);
    expect(card('contabilidade').getByText('Este é um lançamento de demonstração.')).toBeInTheDocument();
  });
});
