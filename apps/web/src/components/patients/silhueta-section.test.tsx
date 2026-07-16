import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createMut = vi.fn();

vi.mock('@/lib/queries/silhueta', () => ({
  useCreateSilhuetaScan: () => ({ mutateAsync: createMut, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SilhuetaSection } from './silhueta-section';

const frontFile = new File(['front'], 'frente.png', { type: 'image/png' });
const sideFile = new File(['side'], 'lado.png', { type: 'image/png' });

beforeEach(() => {
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
