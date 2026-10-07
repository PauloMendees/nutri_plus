import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const resetPasswordForEmail = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { resetPasswordForEmail } }),
}));

import { ForgotPasswordForm } from './forgot-password-form';

beforeEach(() => {
  resetPasswordForEmail.mockReset();
});

describe('ForgotPasswordForm', () => {
  it('does not submit an invalid email', async () => {
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'nope');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/e-mail válido/i)).toBeInTheDocument();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('requests the reset email with the callback redirect and shows a neutral confirmation', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@clinica.com');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledTimes(1));
    const [email, opts] = resetPasswordForEmail.mock.calls[0];
    expect(email).toBe('ana@clinica.com');
    expect(opts.redirectTo).toContain('/auth/callback?next=/reset-password');
    expect(screen.getByText(/se existe uma conta/i)).toBeInTheDocument();
    // Aviso fixo na tela (não é toast): o e-mail pode cair no spam.
    expect(screen.getByText(/não encontrou o e-mail/i)).toHaveTextContent(/caixa de spam ou de lixo eletrônico/i);
  });

  it('does not show the spam hint before sending', () => {
    render(<ForgotPasswordForm />);
    expect(screen.queryByText(/não encontrou o e-mail/i)).not.toBeInTheDocument();
  });

  it('shows a mapped error on failure', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { code: 'over_email_send_rate_limit' } });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@clinica.com');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/muitas tentativas/i)).toBeInTheDocument();
  });
});
