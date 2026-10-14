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

async function openEmailForm() {
  await userEvent.click(screen.getByRole('button', { name: /enviar por e-mail/i }));
}

describe('SupportDialog', () => {
  it('oferece WhatsApp com mensagem pré-preenchida incluindo o e-mail da conta', () => {
    render(
      <SupportDialog open onOpenChange={vi.fn()} defaultEmail="ana@inutri.life" />,
    );

    const link = screen.getByRole('link', { name: /whatsapp/i });
    const url = new URL(link.getAttribute('href')!);
    expect(url.origin + url.pathname).toBe('https://wa.me/5562991376124');
    expect(url.searchParams.get('text')).toBe(
      'Olá! Sou nutricionista e uso o iNutri (conta: ana@inutri.life). Preciso de ajuda com: ',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.queryByLabelText(/descrição/i)).not.toBeInTheDocument();
  });

  it('fecha o diálogo ao abrir o WhatsApp', async () => {
    const onOpenChange = vi.fn();
    render(
      <SupportDialog open onOpenChange={onOpenChange} defaultEmail="ana@inutri.life" />,
    );
    await userEvent.click(screen.getByRole('link', { name: /whatsapp/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('vai para o formulário de e-mail e volta para a escolha', async () => {
    render(
      <SupportDialog open onOpenChange={vi.fn()} defaultEmail="ana@inutri.life" />,
    );
    await openEmailForm();
    expect(screen.getByLabelText(/descrição/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(screen.getByRole('link', { name: /whatsapp/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/descrição/i)).not.toBeInTheDocument();
  });

  it('pré-preenche o e-mail e envia o pedido', async () => {
    submit.mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    render(
      <SupportDialog open onOpenChange={onOpenChange} defaultEmail="ana@inutri.life" />,
    );

    await openEmailForm();
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
    await openEmailForm();
    await userEvent.type(screen.getByLabelText(/descrição/i), 'curto');
    await userEvent.click(screen.getByRole('button', { name: /^enviar$/i }));
    expect(submit).not.toHaveBeenCalled();
    expect(await screen.findByText(/20 caracteres/i)).toBeInTheDocument();
  });
});
