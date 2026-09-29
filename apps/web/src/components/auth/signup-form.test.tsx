import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signUp = vi.fn();
const push = vi.fn();
const trackCompleteRegistration = vi.fn();

// O cadastro DEVE usar createSignupClient (flowType implicit). Se alguém voltar
// para createClient, o mock não cobre e o teste quebra — de propósito.
vi.mock('@/lib/supabase/client', () => ({
  createSignupClient: () => ({ auth: { signUp } }),
}));
vi.mock('@/lib/analytics/meta-conversions', () => ({
  trackCompleteRegistration: (...a: unknown[]) => trackCompleteRegistration(...a),
}));
let currentSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => currentSearchParams,
}));

import { SignupForm } from './signup-form';
import { TERMS_VERSION } from '@/components/legal/terms-of-use';

beforeEach(() => {
  signUp.mockReset();
  push.mockReset();
  trackCompleteRegistration.mockReset();
  currentSearchParams = new URLSearchParams();
});

async function fillValid() {
  await userEvent.type(screen.getByLabelText(/nome/i), 'Dra. Ana');
  await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@clinica.com');
  await userEvent.type(screen.getByLabelText(/whatsapp/i), '(11) 99999-8888');
  await userEvent.type(screen.getByLabelText(/^senha$/i), 'supersecret');
  await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'supersecret');
  await userEvent.click(screen.getByRole('checkbox', { name: /li e concordo com os termos de uso/i }));
}

describe('SignupForm', () => {
  it('blocks signup until the terms of use are accepted', async () => {
    render(<SignupForm />);
    await fillValid();
    // desmarca o aceite que o fillValid marcou
    await userEvent.click(screen.getByRole('checkbox', { name: /li e concordo com os termos de uso/i }));
    await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    expect(await screen.findByText(/aceite os termos de uso/i)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('opens the terms of use in a dialog without ticking the checkbox', async () => {
    render(<SignupForm />);
    await userEvent.click(screen.getByRole('button', { name: /^termos de uso$/i }));
    expect(await screen.findByRole('dialog', { name: /termos de uso/i })).toBeInTheDocument();
    expect(screen.getByText(/46\.894\.998\/0001-16/)).toBeInTheDocument();
    // O dialog modal tira o resto da página da árvore de acessibilidade.
    expect(
      screen.getByRole('checkbox', { name: /li e concordo com os termos de uso/i, hidden: true }),
    ).not.toBeChecked();
  });

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
    // Vai com o DDI (+55 por padrão); o backend canonicaliza no sync-user.
    expect(arg.options.data.whatsapp).toBe('+55 (11) 99999-8888');
    expect(arg.options.emailRedirectTo).toContain('/auth/callback');
    // Aceite dos termos fica registrado nos metadados do usuário no Supabase.
    expect(arg.options.data.termsVersion).toBe(TERMS_VERSION);
    expect(Date.parse(arg.options.data.termsAcceptedAt)).not.toBeNaN();
    // Sem plano escolhido o `plan` vai vazio, mas o `?` tem de existir sempre:
    // o template de e-mail do Supabase concatena `&token_hash=…` nesta URL, e
    // sem query string a concatenação viraria parte do path.
    expect(arg.options.emailRedirectTo).toMatch(/\/auth\/callback\?plan=$/);
    expect(push).toHaveBeenCalledWith('/verify-email?email=ana%40clinica.com');
    // O e-mail vai junto: é dele que o backend tira o SHA-256 do user_data da CAPI.
    expect(trackCompleteRegistration).toHaveBeenCalledWith('ana@clinica.com', 'Dra. Ana');
  });

  it('masks the WhatsApp input as a Brazilian phone', async () => {
    render(<SignupForm />);
    await userEvent.type(screen.getByLabelText(/whatsapp/i), '11999998888');
    expect(screen.getByLabelText(/whatsapp/i)).toHaveValue('(11) 99999-8888');
  });

  it('defaults the country code to +55', () => {
    render(<SignupForm />);
    expect(screen.getByLabelText(/ddi/i)).toHaveValue('+55');
  });

  it('accepts another country code without the Brazilian mask', async () => {
    signUp.mockResolvedValue({ error: null });
    render(<SignupForm />);
    await fillValid();
    await userEvent.clear(screen.getByLabelText(/ddi/i));
    await userEvent.type(screen.getByLabelText(/ddi/i), '1');
    await userEvent.clear(screen.getByLabelText(/whatsapp/i));
    await userEvent.type(screen.getByLabelText(/whatsapp/i), '2025550123');
    expect(screen.getByLabelText(/whatsapp/i)).toHaveValue('2025550123');
    await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp.mock.calls[0][0].options.data.whatsapp).toBe('+1 2025550123');
  });

  it.each([
    ['missing', '', /informe seu whatsapp/i],
    ['invalid', '123', /whatsapp inválido/i],
  ])('blocks signup with a %s WhatsApp', async (_label, value, message) => {
    render(<SignupForm />);
    await fillValid();
    await userEvent.clear(screen.getByLabelText(/whatsapp/i));
    if (value) await userEvent.type(screen.getByLabelText(/whatsapp/i), value);
    await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('shows the chosen plan and keeps it on the confirmation redirect', async () => {
    currentSearchParams = new URLSearchParams('plan=pro');
    signUp.mockResolvedValue({ error: null });
    render(<SignupForm />);
    expect(screen.getByText(/plano escolhido/i)).toHaveTextContent(/pro/i);
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp.mock.calls[0][0].options.emailRedirectTo).toContain('plan=pro');
  });

  it('shows a mapped error on failure', async () => {
    signUp.mockResolvedValue({ error: { code: 'user_already_exists' } });
    render(<SignupForm />);
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    expect(await screen.findByText(/já existe/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(trackCompleteRegistration).not.toHaveBeenCalled();
  });
});
