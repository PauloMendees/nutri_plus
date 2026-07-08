import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signUp = vi.fn();
const push = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signUp } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { SignupForm } from './signup-form';

beforeEach(() => {
  signUp.mockReset();
  push.mockReset();
});

async function fillValid() {
  await userEvent.type(screen.getByLabelText(/nome/i), 'Dra. Ana');
  await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@clinica.com');
  await userEvent.type(screen.getByLabelText(/^senha$/i), 'supersecret');
  await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'supersecret');
}

describe('SignupForm', () => {
  it('rejects mismatched passwords', async () => {
    render(<SignupForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Dra. Ana');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@clinica.com');
    await userEvent.type(screen.getByLabelText(/^senha$/i), 'supersecret');
    await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'different');
    await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    expect(await screen.findByText(/não coincidem/i)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('signs up with name metadata + callback redirect, then routes to verify-email', async () => {
    signUp.mockResolvedValue({ error: null });
    render(<SignupForm />);
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    const arg = signUp.mock.calls[0][0];
    expect(arg.email).toBe('ana@clinica.com');
    expect(arg.options.data.name).toBe('Dra. Ana');
    expect(arg.options.emailRedirectTo).toContain('/auth/callback');
    expect(push).toHaveBeenCalledWith('/verify-email?email=ana%40clinica.com');
  });

  it('shows a mapped error on failure', async () => {
    signUp.mockResolvedValue({ error: { code: 'user_already_exists' } });
    render(<SignupForm />);
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    expect(await screen.findByText(/já existe/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
