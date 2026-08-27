import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { UserRole } from '@nutri-plus/shared-types';
import { createClient } from '@/lib/supabase/server';
import { syncUser } from '@/lib/api/auth';
import { parseSignupPlan } from '@/lib/billing/signup-plan';

/** Only honor internal paths — never an absolute or protocol-relative URL. */
function isSafeNext(next: string): boolean {
  return next.startsWith('/') && !next.startsWith('//');
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next');

  const loginError = (msg: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);

  if (!code && !tokenHash) return loginError('Link de confirmação inválido.');

  const supabase = await createClient();

  // Dois fluxos, por ordem de robustez:
  //
  // token_hash (verifyOtp) — stateless. É o que o link do e-mail deve usar:
  // e-mail é aberto em aparelho e navegador imprevisíveis (celular, webview do
  // app de e-mail), e nada disso carrega estado do cadastro.
  //
  // code (PKCE) — exige o code_verifier no cookie do MESMO navegador que
  // iniciou o cadastro. Mantido para os links já em circulação e para o OAuth.
  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({
        type: (type ?? 'signup') as EmailOtpType,
        token_hash: tokenHash,
      })
    : await supabase.auth.exchangeCodeForSession(code!);
  if (error) return loginError('Não foi possível confirmar seu e-mail. Tente entrar.');

  // Recovery (or any internal next): land where `next` says, without syncing —
  // a password reset is not a fresh signup.
  if (next && isSafeNext(next)) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Signup confirmation: provision the local profile (idempotent), then
  // land on plan selection so the nutri can start the trial or subscribe.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    try {
      await syncUser(session.access_token, UserRole.NUTRITIONIST);
    } catch {
      return loginError('Conta confirmada, mas houve um erro ao finalizar. Tente entrar.');
    }
  }

  const plan = parseSignupPlan(searchParams.get('plan'));
  const dest = plan ? `/assinatura?plan=${plan === 'PRO' ? 'pro' : 'essencial'}` : '/assinatura';
  return NextResponse.redirect(`${origin}${dest}`);
}
