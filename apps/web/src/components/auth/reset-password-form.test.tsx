import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const updateUser = vi.fn();
const signOut = vi.fn();
const push = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { updateUser, signOut } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { ResetPasswordForm } from './reset-password-form';

beforeEach(() => {
  updateUser.mockReset();
  signOut.mockReset();
  push.mockReset();
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
});
