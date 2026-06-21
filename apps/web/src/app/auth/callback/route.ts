import { NextResponse, type NextRequest } from 'next/server';
import { UserRole } from '@nutri-plus/shared-types';
import { createClient } from '@/lib/supabase/server';
import { syncUser } from '@/lib/api/auth';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  const loginError = (msg: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);

  if (!code) return loginError('Link de confirmação inválido.');

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return loginError('Não foi possível confirmar seu e-mail. Tente entrar.');

  // Provision the local profile (idempotent; the web only registers nutritionists).
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

  return NextResponse.redirect(`${origin}/`);
}
