import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getSession = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const push = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession, updateUser, signOut } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { AcceptInvite } from './accept-invite';

beforeEach(() => {
  getSession.mockReset();
  updateUser.mockReset();
  signOut.mockReset();
  push.mockReset();
});

describe('AcceptInvite', () => {
  it('shows the invalid state when there is no invite session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<AcceptInvite />);
    expect(await screen.findByText(/convite inválido ou expirado/i)).toBeInTheDocument();
  });

  it('sets the password, signs out, and routes to /download-app', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'p1' } } } });
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    render(<AcceptInvite />);

    await userEvent.type(await screen.findByLabelText(/^senha$/i), 'supersecret');
    await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /concluir cadastro/i }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'supersecret' }));
    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/download-app');
  });

  it('shows a mapped error and does not redirect on failure', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'p1' } } } });
    updateUser.mockResolvedValue({ error: { code: 'same_password' } });
    render(<AcceptInvite />);

    await userEvent.type(await screen.findByLabelText(/^senha$/i), 'supersecret');
    await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /concluir cadastro/i }));

    expect(await screen.findByText(/diferente da atual/i)).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
