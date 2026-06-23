import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const push = vi.fn();

let authCallback: ((event: string, session: unknown) => void) | undefined;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession, onAuthStateChange, updateUser, signOut } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { AcceptInvite } from './accept-invite';

beforeEach(() => {
  getSession.mockReset();
  onAuthStateChange.mockReset();
  updateUser.mockReset();
  signOut.mockReset();
  push.mockReset();
  authCallback = undefined;
  // Default: no session yet. Capture the auth-state callback so tests can drive it.
  getSession.mockResolvedValue({ data: { session: null } });
  onAuthStateChange.mockImplementation((cb) => {
    authCallback = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

describe('AcceptInvite', () => {
  it('shows the invalid state when initialization reports no session', async () => {
    // getSession default resolves null; INITIAL_SESSION with no session settles it.
    render(<AcceptInvite />);
    await act(async () => {
      authCallback?.('INITIAL_SESSION', null);
    });
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

  it('shows the form when the session arrives via an auth event (not getSession)', async () => {
    // getSession resolves null, but a later SIGNED_IN event carries the session.
    render(<AcceptInvite />);
    await act(async () => {
      authCallback?.('SIGNED_IN', { user: { id: 'p1' } });
    });
    expect(await screen.findByLabelText(/^senha$/i)).toBeInTheDocument();
  });
});
