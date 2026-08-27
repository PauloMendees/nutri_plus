import { describe, it, expect, beforeEach } from 'vitest';
import { createClient, createSignupClient } from './client';

// Por que este teste existe:
//
// O link de confirmação de e-mail é aberto num navegador imprevisível — a maior
// parte dos leads chega pelo Instagram, cadastra na webview do app e clica no
// link no Chrome. São cookie jars diferentes.
//
// Com flowType 'pkce', o signUp registra um code_challenge e o Supabase emite um
// token prefixado `pkce_`, que SÓ pode ser trocado com o code_verifier guardado
// no navegador de origem. O e-mail vira um link que só funciona onde nasceu.
//
// Com flowType 'implicit', o signUp não manda challenge (ver o gate
// `if (this.flowType === 'pkce')` no signUp do auth-js), o token sai sem
// prefixo, e o /auth/callback o verifica via verifyOtp sem estado algum.
//
// ATENÇÃO: createBrowserClient do @supabase/ssr FORÇA flowType: 'pkce' depois de
// espalhar as opções — passar `auth: { flowType }` para ele é silenciosamente
// ignorado. Por isso o client de cadastro não pode vir dele.
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-de-teste';
});

const flowTypeOf = (c: ReturnType<typeof createClient>) =>
  (c.auth as unknown as { flowType: string }).flowType;

describe('clients Supabase do browser', () => {
  it('createSignupClient usa flowType implicit — token de e-mail sem amarra de navegador', () => {
    expect(flowTypeOf(createSignupClient())).toBe('implicit');
  });

  it('createSignupClient não persiste sessão (o cadastro não emite uma)', () => {
    // Precisa ficar inerte para não competir com os cookies do client SSR.
    const c = createSignupClient();
    expect((c.auth as unknown as { persistSession: boolean }).persistSession).toBe(false);
  });

  it('createClient (SSR) permanece pkce — o reset de senha depende disso', () => {
    expect(flowTypeOf(createClient())).toBe('pkce');
  });
});
