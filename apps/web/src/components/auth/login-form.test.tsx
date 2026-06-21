import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signInWithPassword = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithPassword } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

import { LoginForm } from './login-form';

beforeEach(() => {
  signInWithPassword.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe('LoginForm', () => {
  it('shows a validation error for an invalid email', async () => {
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'nope');
    await userEvent.type(screen.getByLabelText(/senha/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByText(/e-mail válido/i)).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in and redirects on success', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@clinica.com');
    await userEvent.type(screen.getByLabelText(/senha/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'ana@clinica.com',
        password: 'secret123',
      }),
    );
    expect(push).toHaveBeenCalledWith('/');
    expect(refresh).toHaveBeenCalled();
  });

  it('shows a mapped error message on failure', async () => {
    signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials' } });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@clinica.com');
    await userEvent.type(screen.getByLabelText(/senha/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByText(/inválidos/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
