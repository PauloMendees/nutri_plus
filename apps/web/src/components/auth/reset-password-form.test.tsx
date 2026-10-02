import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const updateUser = vi.fn();
const signOut = vi.fn();
const push = vi.fn();
const getSession = vi.fn();
const getMe = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { updateUser, signOut, getSession } }),
}));
vi.mock('@/lib/api/auth', () => ({ getMe: (token: string) => getMe(token) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { ResetPasswordForm } from './reset-password-form';

beforeEach(() => {
  updateUser.mockReset();
  signOut.mockReset();
  push.mockReset();
  getMe.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  getMe.mockResolvedValue({ role: 'NUTRITIONIST' });
});

async function fill(pw: string, confirm: string) {
  await userEvent.type(screen.getByLabelText(/nova senha/i), pw);
  await userEvent.type(screen.getByLabelText(/confirmar senha/i), confirm);
}

describe('ResetPasswordForm', () => {
  it('rejects mismatched passwords', async () => {
    render(<ResetPasswordForm />);
    await fill('supersecret', 'different');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(await screen.findByText(/não coincidem/i)).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('updates the password, signs out, and returns to /login?reset=1', async () => {
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    render(<ResetPasswordForm />);
    await fill('supersecret', 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({ password: 'supersecret' }),
    );
    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/login?reset=1');
  });

  it('shows a mapped error and does not redirect on failure', async () => {
    updateUser.mockResolvedValue({ error: { code: 'same_password' } });
    render(<ResetPasswordForm />);
    await fill('supersecret', 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(await screen.findByText(/diferente da atual/i)).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  // Paciente não tem acesso ao web: depois de trocar a senha, vai para a página
  // que abre o app, nunca para o login web.
  it('sends a patient to /senha-alterada instead of the web login', async () => {
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    getMe.mockResolvedValue({ role: 'PATIENT' });
    render(<ResetPasswordForm />);
    await fill('supersecret', 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/senha-alterada'));
    expect(getMe).toHaveBeenCalledWith('tok');
    expect(signOut).toHaveBeenCalled();
    // O papel é lido antes do logout, enquanto a sessão de recuperação existe.
    expect(getMe.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
  });

  it('falls back to /login?reset=1 when the role lookup fails', async () => {
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    getMe.mockRejectedValue(new Error('boom'));
    render(<ResetPasswordForm />);
    await fill('supersecret', 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?reset=1'));
    expect(signOut).toHaveBeenCalled();
  });
});
