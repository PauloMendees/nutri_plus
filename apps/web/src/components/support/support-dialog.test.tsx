import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const submit = vi.fn();
vi.mock('@/lib/api/support', () => ({
  submitSupportRequest: (b: unknown) => submit(b),
}));

import { SupportDialog } from './support-dialog';

beforeEach(() => {
  submit.mockReset();
});

describe('SupportDialog', () => {
  it('pré-preenche o e-mail e envia o pedido', async () => {
    submit.mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    render(
      <SupportDialog open onOpenChange={onOpenChange} defaultEmail="ana@inutri.life" />,
    );

    expect(screen.getByLabelText(/e-mail para retorno/i)).toHaveValue('ana@inutri.life');

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: /pagamento/i }));

    await userEvent.type(
      screen.getByLabelText(/descrição/i),
      'Não consigo visualizar a fatura do mês passado no painel de assinatura.',
    );

    await userEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'ana@inutri.life',
          category: 'BILLING',
        }),
      ),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('bloqueia envio com descrição curta', async () => {
    render(
      <SupportDialog open onOpenChange={vi.fn()} defaultEmail="ana@inutri.life" />,
    );
    await userEvent.type(screen.getByLabelText(/descrição/i), 'curto');
    await userEvent.click(screen.getByRole('button', { name: /^enviar$/i }));
    expect(submit).not.toHaveBeenCalled();
    expect(await screen.findByText(/20 caracteres/i)).toBeInTheDocument();
  });
});
