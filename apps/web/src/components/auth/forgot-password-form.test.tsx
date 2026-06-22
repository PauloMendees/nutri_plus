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
  });

  it('shows a mapped error on failure', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { code: 'over_email_send_rate_limit' } });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@clinica.com');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/muitas tentativas/i)).toBeInTheDocument();
  });
});
