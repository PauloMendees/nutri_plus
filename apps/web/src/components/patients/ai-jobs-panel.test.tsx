import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiJobView } from '@nutri-plus/shared-types';

const useAiJobsMock = vi.fn();
const retryMut = vi.fn();
vi.mock('@/lib/queries/ai-jobs', () => ({
  useAiJobs: (...a: unknown[]) => useAiJobsMock(...a),
  useRetryAiJob: () => ({ mutateAsync: retryMut, isPending: false }),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { AiJobsPanel } from './ai-jobs-panel';

function job(over: Partial<AiJobView> = {}): AiJobView {
  return {
    id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'RUNNING', patientId: 'p1',
    patientName: 'Maria Silva',
    mealPlanId: null, error: null, createdAt: '2026-08-28T12:00:00.000Z',
    startedAt: '2026-08-28T12:00:00.000Z', finishedAt: null, isStuck: false, ...over,
  };
}

beforeEach(() => {
  retryMut.mockReset().mockResolvedValue({ jobId: 'j1' });
  useAiJobsMock.mockReset().mockReturnValue({ data: [], isLoading: false });
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe('AiJobsPanel', () => {
  it('não renderiza nada quando não há trabalho', () => {
    const { container } = render(<AiJobsPanel patientId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra a geração em andamento', () => {
    useAiJobsMock.mockReturnValue({ data: [job()], isLoading: false });
    render(<AiJobsPanel patientId="p1" />);
    expect(screen.getByText(/gerando plano/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tentar de novo/i })).not.toBeInTheDocument();
  });

  it('oferece repetir quando falhou e chama a mutação', async () => {
    useAiJobsMock.mockReturnValue({ data: [job({ status: 'FAILED', error: 'boom' })], isLoading: false });
    render(<AiJobsPanel patientId="p1" />);
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(retryMut).toHaveBeenCalledWith('j1');
  });

  it('oferece repetir quando travou', () => {
    useAiJobsMock.mockReturnValue({ data: [job({ isStuck: true })], isLoading: false });
    render(<AiJobsPanel patientId="p1" />);
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });

  it('não lista trabalho já concluído', () => {
    useAiJobsMock.mockReturnValue({
      data: [job({ type: 'MEAL_PLAN_ADJUSTMENT', status: 'DONE' })],
      isLoading: false,
    });
    const { container } = render(<AiJobsPanel patientId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o motivo salvo pelo backend quando o job falhou', () => {
    useAiJobsMock.mockReturnValue({
      data: [job({ status: 'FAILED', error: 'Complete o cadastro. Faltando: altura, objetivo.' })],
      isLoading: false,
    });
    render(<AiJobsPanel patientId="p1" />);
    expect(screen.getByText('Complete o cadastro. Faltando: altura, objetivo.')).toBeInTheDocument();
  });

  it('mostra erro quando repetir falha', async () => {
    retryMut.mockRejectedValue(new Error('boom'));
    useAiJobsMock.mockReturnValue({ data: [job({ status: 'FAILED', error: 'boom' })], isLoading: false });
    render(<AiJobsPanel patientId="p1" />);
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(toastMock.error).toHaveBeenCalledWith('Não foi possível repetir agora.');
  });
});
