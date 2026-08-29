import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiJobView } from '@nutri-plus/shared-types';

const useAllAiJobsMock = vi.fn();
vi.mock('@/lib/queries/ai-jobs', () => ({
  useAllAiJobs: () => useAllAiJobsMock(),
}));

import { AiJobsWidget } from './ai-jobs-widget';

function job(over: Partial<AiJobView> = {}): AiJobView {
  return {
    id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'RUNNING',
    patientId: 'p1', patientName: 'Maria Silva',
    mealPlanId: null, error: null, createdAt: '2026-08-29T12:00:00.000Z',
    startedAt: '2026-08-29T12:00:00.000Z', finishedAt: null, isStuck: false, ...over,
  };
}

beforeEach(() => {
  useAllAiJobsMock.mockReset().mockReturnValue({ data: [], isLoading: false });
  try {
    localStorage.clear();
  } catch {
    // ambiente sem storage
  }
});

describe('AiJobsWidget', () => {
  it('não renderiza nada quando não há trabalho', () => {
    const { container } = render(<AiJobsWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o processo com o nome do paciente', () => {
    useAllAiJobsMock.mockReturnValue({ data: [job()], isLoading: false });
    render(<AiJobsWidget />);
    expect(screen.getByText('Gerando plano')).toBeInTheDocument();
    // Sem o nome, dois processos simultâneos ficariam indistinguíveis.
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
  });

  it('leva para o paciente do processo', () => {
    useAllAiJobsMock.mockReturnValue({ data: [job()], isLoading: false });
    render(<AiJobsWidget />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/patients/p1');
  });

  it('minimiza e restaura, mantendo a contagem visível', async () => {
    useAllAiJobsMock.mockReturnValue({ data: [job(), job({ id: 'j2' })], isLoading: false });
    render(<AiJobsWidget />);

    await userEvent.click(screen.getByRole('button', { name: /minimizar processos de ia/i }));

    expect(screen.queryByTestId('ai-jobs-widget')).not.toBeInTheDocument();
    const pill = screen.getByRole('button', { name: /processos de ia · 2/i });

    await userEvent.click(pill);
    expect(screen.getByTestId('ai-jobs-widget')).toBeInTheDocument();
  });

  it('não lista trabalho concluído — ele vira a faixa do editor', () => {
    useAllAiJobsMock.mockReturnValue({
      data: [job({ type: 'MEAL_PLAN_ADJUSTMENT', status: 'DONE' })],
      isLoading: false,
    });
    const { container } = render(<AiJobsWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra falha com destaque, sem spinner', () => {
    useAllAiJobsMock.mockReturnValue({
      data: [job({ status: 'FAILED', type: 'MEAL_PLAN_ADJUSTMENT' })],
      isLoading: false,
    });
    render(<AiJobsWidget />);
    expect(screen.getByText('Falha ao ajustar o plano')).toBeInTheDocument();
  });
});
