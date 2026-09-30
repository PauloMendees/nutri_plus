import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Row = { id: string; patientId: string; assessmentDate: string; weight: number };

const rows: Row[] = [];
const listAssessments = vi.fn(async (_patientId: string) => [...rows]);
const createAssessment = vi.fn(async (_patientId: string, body: { assessmentDate?: string; weight?: number }) => {
  const row: Row = {
    id: `a${rows.length + 1}`,
    patientId: 'p1',
    assessmentDate: `${body.assessmentDate}T00:00:00.000Z`,
    weight: Number(body.weight),
  };
  rows.push(row);
  return row;
});

vi.mock('@/lib/api/assessments', () => ({
  listAssessments: (patientId: string) => listAssessments(patientId),
  createAssessment: (patientId: string, body: { assessmentDate?: string; weight?: number }) =>
    createAssessment(patientId, body),
  updateAssessment: vi.fn(),
  deleteAssessment: vi.fn(),
}));
vi.mock('@/components/onboarding/tour-provider', () => ({
  useTour: () => ({
    start: vi.fn(),
    exit: vi.fn(),
    skipChapter: vi.fn(),
    isPlayDemoSubmit: () => false,
    notifyChapterActionSucceeded: vi.fn(() => Promise.resolve(false)),
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

import { BioimpedanceSection } from './bioimpedance-section';

// Regressão (QA de 2026-09-30): a lista da aba precisa mostrar a avaliação nova
// sem recarregar a página — cache real do React Query, só a API mockada.
describe('BioimpedanceSection + AssessmentDialog', () => {
  it('shows a newly saved assessment in the list without a reload', async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <BioimpedanceSection patientId="p1" canEdit />
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /nova avaliação/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/peso \(kg\)/i), '70');
    await userEvent.click(within(dialog).getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(createAssessment).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText(/70/).length).toBeGreaterThan(0));
    expect(listAssessments.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
