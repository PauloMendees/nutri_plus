import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SilhuetaScan } from '@nutri-plus/shared-types';

const useSilhuetaScansMock = vi.fn();
const applyMutateAsync = vi.fn();
const useApplySilhuetaScanMock = vi.fn();

vi.mock('@/lib/queries/silhueta', () => ({
  useSilhuetaScans: (...args: unknown[]) => useSilhuetaScansMock(...args),
  useApplySilhuetaScan: (...args: unknown[]) => useApplySilhuetaScanMock(...args),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));

// Recharts renders SVG via ResponsiveContainer (no layout in jsdom) — stub it,
// mirroring bioimpedance-section.test.tsx.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div data-testid="chart-data">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

import { SilhuetaReport } from './silhueta-report';

function scan(over: Partial<SilhuetaScan> = {}): SilhuetaScan {
  return {
    id: 's1',
    patientId: 'p1',
    scanDate: '2026-07-01T00:00:00.000Z',
    heightCm: 170,
    weightKg: 70,
    waistInput: 80,
    hipInput: 100,
    bodyFatPercentage: 22,
    muscleMassPercentage: 35,
    leanMassPercentage: 60,
    fatMass: 15.4,
    waistCircumference: null,
    hipCircumference: null,
    chestCircumference: null,
    armCircumference: null,
    thighCircumference: null,
    abdomenCircumference: null,
    contractedArmCircumference: null,
    calfCircumference: null,
    consentAcceptedAt: '2026-07-01T00:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  useSilhuetaScansMock.mockReset().mockReturnValue({ data: [scan()] });
  applyMutateAsync.mockReset().mockResolvedValue({});
  useApplySilhuetaScanMock.mockReset().mockReturnValue({ mutateAsync: applyMutateAsync, isPending: false });
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe('SilhuetaReport', () => {
  it('renders index bars with values and classifications from the scan fixture', () => {
    render(<SilhuetaReport patientId="p1" scan={scan()} />);

    // bodyFatPercentage = 22 → within the 10–25 "Normal" band
    expect(screen.getByText('22%')).toBeInTheDocument();

    // IMC = 70 / (1.70^2) ≈ 24.2 → also within the 18.5–25 "Normal" band, so two badges render
    expect(screen.getAllByText('Normal').length).toBe(2);

    // weight is shown on a neutral bar with no classification badge
    expect(screen.getByText('70 kg')).toBeInTheDocument();
  });

  it('shows — for a null metric without crashing (e.g. weight/height missing → IMC unavailable)', () => {
    const s = scan({ weightKg: null, heightCm: null });
    useSilhuetaScansMock.mockReturnValue({ data: [s] });
    render(<SilhuetaReport patientId="p1" scan={s} />);

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('classifies a low body-fat value as "Abaixo"', () => {
    const s = scan({ bodyFatPercentage: 8 });
    useSilhuetaScansMock.mockReturnValue({ data: [s] });
    render(<SilhuetaReport patientId="p1" scan={s} />);

    expect(screen.getByText('8%')).toBeInTheDocument();
    expect(screen.getByText('Abaixo')).toBeInTheDocument();
  });

  it('classifies a high body-fat value as "Acima"', () => {
    const s = scan({ bodyFatPercentage: 30 });
    useSilhuetaScansMock.mockReturnValue({ data: [s] });
    render(<SilhuetaReport patientId="p1" scan={s} />);

    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('Acima')).toBeInTheDocument();
  });

  it('calls the apply mutation with the viewed scan id and toasts on success', async () => {
    const s = scan();
    render(<SilhuetaReport patientId="p1" scan={s} />);

    await userEvent.click(screen.getByRole('button', { name: /atualizar avaliação do paciente/i }));

    await waitFor(() => expect(applyMutateAsync).toHaveBeenCalledWith('s1'));
    expect(toastSuccess).toHaveBeenCalledWith('Avaliação atualizada com os dados do Silhueta.');
  });

  it('marks the scan as saved and requires confirmation before saving again', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SilhuetaReport patientId="p1" scan={scan()} />);

    await userEvent.click(
      screen.getByRole('button', { name: /atualizar avaliação do paciente/i }),
    );
    await waitFor(() => expect(applyMutateAsync).toHaveBeenCalledTimes(1));

    // Identified as saved; the button changes and a confirm gate protects re-save.
    expect(screen.getByText(/já salvo/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /salvar novamente/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(applyMutateAsync).toHaveBeenCalledTimes(1); // declined → no second save
    confirmSpy.mockRestore();
  });

  it('saves again when the user confirms the re-save', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SilhuetaReport patientId="p1" scan={scan()} />);

    await userEvent.click(
      screen.getByRole('button', { name: /atualizar avaliação do paciente/i }),
    );
    await waitFor(() => expect(applyMutateAsync).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: /salvar novamente/i }));
    await waitFor(() => expect(applyMutateAsync).toHaveBeenCalledTimes(2));
    confirmSpy.mockRestore();
  });

  it('disables the apply button while the mutation is pending', () => {
    useApplySilhuetaScanMock.mockReturnValue({ mutateAsync: applyMutateAsync, isPending: true });
    render(<SilhuetaReport patientId="p1" scan={scan()} />);

    expect(screen.getByRole('button', { name: /atualizando/i })).toBeDisabled();
  });

  it('renders disclaimers and the Conceitos block', () => {
    render(<SilhuetaReport patientId="p1" scan={scan()} />);

    expect(screen.getByText(/Compare apenas/i)).toBeInTheDocument();
    expect(screen.getByText('Conceitos')).toBeInTheDocument();
  });
});
