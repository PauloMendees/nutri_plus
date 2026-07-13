import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useAssessments = vi.fn();
vi.mock('@/lib/queries/assessments', () => ({
  useAssessments: () => useAssessments(),
  useCreateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const downloadAssessmentsPdf = vi.fn();
vi.mock('@/lib/api/assessments', () => ({
  downloadAssessmentsPdf: (...args: unknown[]) => downloadAssessmentsPdf(...args),
}));

// Recharts renders SVG via ResponsiveContainer (no layout in jsdom) — stub it.
// LineChart echoes its `data` so tests can assert the charted series.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
  LineChart: ({ data, children }: { data: unknown; children: ReactNode }) => (
    <div data-testid="chart-data">
      {JSON.stringify(data)}
      {children}
    </div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

import { BioimpedanceSection } from './bioimpedance-section';

function assessment(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    patientId: 'p1',
    assessmentDate: '2026-05-12T00:00:00.000Z',
    weight: 78.2,
    bodyFatPercentage: 22,
    muscleMass: 34,
    leanMass: 60,
    visceralFat: null,
    basalMetabolicRate: 1680,
    bodyWaterPercentage: null,
    boneMass: null,
    metabolicAge: null,
    waistCircumference: 82,
    hipCircumference: null,
    chestCircumference: null,
    armCircumference: null,
    thighCircumference: null,
    notes: null,
    createdAt: '2026-05-12T00:00:00.000Z',
    loggedByPatient: false,
    ...over,
  };
}

beforeEach(() => {
  useAssessments.mockReset();
  downloadAssessmentsPdf.mockReset().mockResolvedValue(undefined);
});

describe('BioimpedanceSection', () => {
  it('shows the loading skeleton', () => {
    useAssessments.mockReturnValue({ isLoading: true });
    render(<BioimpedanceSection patientId="p1" />);
    expect(screen.getByTestId('bio-loading')).toBeInTheDocument();
  });

  it('shows the empty state with a CTA when canEdit', () => {
    useAssessments.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<BioimpedanceSection patientId="p1" canEdit />);
    expect(screen.getByText(/nenhuma avaliação ainda/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /registrar avaliação/i })).toBeInTheDocument();
  });

  it('renders summary cards and the history table', () => {
    useAssessments.mockReturnValue({ isLoading: false, isError: false, data: [assessment()] });
    render(<BioimpedanceSection patientId="p1" canEdit />);
    expect(screen.getAllByText(/78,2/).length).toBeGreaterThan(0); // weight in summary + table
    expect(screen.getByRole('button', { name: /nova avaliação/i })).toBeInTheDocument();
  });

  it('switches the charted metric when a chip is clicked', async () => {
    useAssessments.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        assessment(),
        assessment({ id: 'a2', assessmentDate: '2026-04-12T00:00:00.000Z', weight: 80, bodyFatPercentage: 24 }),
      ],
    });
    render(<BioimpedanceSection patientId="p1" canEdit />);
    // default metric = weight: series contains the weights
    expect(screen.getByTestId('chart-data').textContent).toContain('80');
    await userEvent.click(screen.getByRole('button', { name: '% Gordura' }));
    // now the body-fat values are charted
    expect(screen.getByTestId('chart-data').textContent).toContain('24');
  });

  it('hides write affordances for employees (canEdit=false)', () => {
    useAssessments.mockReturnValue({ isLoading: false, isError: false, data: [assessment()] });
    render(<BioimpedanceSection patientId="p1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /nova avaliação/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('flags patient-logged rows with an icon + tooltip trigger', () => {
    useAssessments.mockReturnValue({
      data: [assessment({ id: 'a1', loggedByPatient: true })],
      isLoading: false,
      isError: false,
    });
    render(<BioimpedanceSection patientId="p1" />);
    expect(screen.getByLabelText('Registrado pelo paciente')).toBeInTheDocument();
  });

  it('exports the evolution PDF when there are assessments', async () => {
    const user = userEvent.setup();
    useAssessments.mockReturnValue({ isLoading: false, isError: false, data: [assessment()] });
    render(<BioimpedanceSection patientId="p1" canEdit />);
    await user.click(screen.getByRole('button', { name: /exportar pdf/i }));
    expect(downloadAssessmentsPdf).toHaveBeenCalledWith('p1');
  });

  it('does not flag nutritionist-logged rows', () => {
    useAssessments.mockReturnValue({
      data: [assessment({ id: 'a1', loggedByPatient: false })],
      isLoading: false,
      isError: false,
    });
    render(<BioimpedanceSection patientId="p1" />);
    expect(screen.queryByLabelText('Registrado pelo paciente')).not.toBeInTheDocument();
  });
});
