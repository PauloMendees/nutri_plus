import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getSession = vi.fn();
const setSession = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const push = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession, setSession, updateUser, signOut } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { AcceptInvite } from './accept-invite';

/** Put the invite tokens (or nothing) in the URL hash the component reads. */
function setHash(hash: string) {
  window.history.replaceState(null, '', `/accept-invite${hash}`);
}

beforeEach(() => {
  getSession.mockReset();
  setSession.mockReset();
  updateUser.mockReset();
  signOut.mockReset();
  push.mockReset();
  // Defaults: no existing session; setSession resolves with no session unless overridden.
  getSession.mockResolvedValue({ data: { session: null } });
  setSession.mockResolvedValue({ data: { session: null }, error: null });
  setHash('');
});

describe('AcceptInvite', () => {
  it('shows the invalid state when there is no invite token and no session', async () => {
    setHash('');
    render(<AcceptInvite />);
    expect(await screen.findByText(/convite inválido ou expirado/i)).toBeInTheDocument();
    expect(setSession).not.toHaveBeenCalled();
  });

  it('establishes the session from the invite hash, then sets the password, signs out, and routes to /download-app', async () => {
    setHash('#access_token=a.b.c&refresh_token=rt123&type=invite');
    setSession.mockResolvedValue({ data: { session: { user: { id: 'p1' } } }, error: null });
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    render(<AcceptInvite />);

    await userEvent.type(await screen.findByLabelText(/^senha$/i), 'supersecret');
    await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /concluir cadastro/i }));

    await waitFor(() =>
      expect(setSession).toHaveBeenCalledWith({ access_token: 'a.b.c', refresh_token: 'rt123' }),
    );
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'supersecret' }));
    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/download-app');
  });

  it('shows a mapped error and does not redirect when updateUser fails', async () => {
    setHash('#access_token=a.b.c&refresh_token=rt123');
    setSession.mockResolvedValue({ data: { session: { user: { id: 'p1' } } }, error: null });
    updateUser.mockResolvedValue({ error: { code: 'same_password' } });
    render(<AcceptInvite />);

    await userEvent.type(await screen.findByLabelText(/^senha$/i), 'supersecret');
    await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /concluir cadastro/i }));

    expect(await screen.findByText(/diferente da atual/i)).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows the invalid state when setSession rejects the invite token', async () => {
    setHash('#access_token=bad&refresh_token=bad');
    setSession.mockResolvedValue({ data: { session: null }, error: { message: 'invalid token' } });
    render(<AcceptInvite />);
    expect(await screen.findByText(/convite inválido ou expirado/i)).toBeInTheDocument();
  });

  it('shows the form when a session already exists (revisit, no hash)', async () => {
    setHash('');
    getSession.mockResolvedValue({ data: { session: { user: { id: 'p1' } } } });
    render(<AcceptInvite />);
    expect(await screen.findByLabelText(/^senha$/i)).toBeInTheDocument();
    expect(setSession).not.toHaveBeenCalled();
  });
});
