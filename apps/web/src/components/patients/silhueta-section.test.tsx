import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createMut = vi.fn();
const applyMut = vi.fn();

vi.mock('@/lib/queries/silhueta', () => ({
  useCreateSilhuetaScan: () => ({ mutateAsync: createMut, isPending: false }),
  useSilhuetaScans: () => ({ data: [] }),
  useApplySilhuetaScan: () => ({ mutateAsync: applyMut, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Recharts renders SVG via ResponsiveContainer (no layout in jsdom) — stub it,
// mirroring bioimpedance-section.test.tsx.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

import { SilhuetaSection } from './silhueta-section';

const frontFile = new File(['front'], 'frente.png', { type: 'image/png' });
const sideFile = new File(['side'], 'lado.png', { type: 'image/png' });
const backFile = new File(['back'], 'costas.png', { type: 'image/png' });

beforeEach(() => {
  // jsdom doesn't implement object URLs — stub them for the photo previews.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  createMut.mockReset().mockResolvedValue({ id: 's1' });
});

describe('SilhuetaSection', () => {
  it('disables submit until both photos and consent are provided', async () => {
    render(<SilhuetaSection patientId="p1" />);
    const submit = screen.getByRole('button', { name: /enviar para análise/i });
    expect(submit).toBeDisabled();

    await userEvent.upload(screen.getByLabelText('Foto frontal'), frontFile);
    expect(submit).toBeDisabled();

    await userEvent.upload(screen.getByLabelText('Foto lateral'), sideFile);
    expect(submit).toBeDisabled();

    await userEvent.click(
      screen.getByLabelText(/consentimento para processamento das fotos por ia/i),
    );
    expect(submit).toBeEnabled();
  });

  it('submits a FormData with front/side photos once satisfied', async () => {
    render(<SilhuetaSection patientId="p1" />);

    await userEvent.upload(screen.getByLabelText('Foto frontal'), frontFile);
    await userEvent.upload(screen.getByLabelText('Foto lateral'), sideFile);
    await userEvent.click(
      screen.getByLabelText(/consentimento para processamento das fotos por ia/i),
    );
    await userEvent.click(screen.getByRole('button', { name: /enviar para análise/i }));

    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1));
    const fd = createMut.mock.calls[0][0] as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('front')).toBe(frontFile);
    expect(fd.get('side')).toBe(sideFile);
    expect(fd.get('consent')).toBe('true');
    // Back photo is optional — omitted here, so it must not be in the payload.
    expect(fd.get('back')).toBeNull();
  });

  it('shows a preview of a selected photo', async () => {
    render(<SilhuetaSection patientId="p1" />);
    expect(screen.queryByAltText('Pré-visualização: Foto frontal')).toBeNull();

    await userEvent.upload(screen.getByLabelText('Foto frontal'), frontFile);

    expect(
      await screen.findByAltText('Pré-visualização: Foto frontal'),
    ).toBeInTheDocument();
  });

  it('includes the optional back photo in FormData when provided', async () => {
    render(<SilhuetaSection patientId="p1" />);

    await userEvent.upload(screen.getByLabelText('Foto frontal'), frontFile);
    await userEvent.upload(screen.getByLabelText('Foto lateral'), sideFile);
    await userEvent.upload(screen.getByLabelText('Foto de costas'), backFile);
    await userEvent.click(
      screen.getByLabelText(/consentimento para processamento das fotos por ia/i),
    );
    await userEvent.click(screen.getByRole('button', { name: /enviar para análise/i }));

    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1));
    const fd = createMut.mock.calls[0][0] as FormData;
    expect(fd.get('back')).toBe(backFile);
  });

  it('shows a placeholder and calls onCreated after a successful scan', async () => {
    const onCreated = vi.fn();
    render(<SilhuetaSection patientId="p1" onCreated={onCreated} />);

    await userEvent.upload(screen.getByLabelText('Foto frontal'), frontFile);
    await userEvent.upload(screen.getByLabelText('Foto lateral'), sideFile);
    await userEvent.click(
      screen.getByLabelText(/consentimento para processamento das fotos por ia/i),
    );
    await userEvent.click(screen.getByRole('button', { name: /enviar para análise/i }));

    expect(await screen.findByText(/estimativa gerada com sucesso/i)).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledWith({ id: 's1' });
  });
});
