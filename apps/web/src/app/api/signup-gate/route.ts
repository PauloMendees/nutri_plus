import { NextResponse, type NextRequest } from 'next/server';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Gate de cadastro (ver CONTEXT.md): verifica no servidor o token do Turnstile
 * antes de o formulário chamar o signUp do Supabase. A chave secreta nunca sai
 * daqui. Sem chave configurada, falha fechado (503) para uma produção mal
 * configurada não ficar desprotegida em silêncio; em dev o formulário nem
 * chama esta rota, porque a site key pública não está definida.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ code: 'CAPTCHA_NOT_CONFIGURED' }, { status: 503 });
  }

  let token: unknown;
  try {
    token = ((await request.json()) as { token?: unknown } | null)?.token;
  } catch {
    token = undefined;
  }
  if (typeof token !== 'string' || token.length === 0) {
    return NextResponse.json({ code: 'CAPTCHA_TOKEN_MISSING' }, { status: 400 });
  }

  const body = new URLSearchParams({ secret, response: token });
  // O Vercel preenche x-forwarded-for; o primeiro IP é o do cliente.
  const remoteip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (remoteip) body.set('remoteip', remoteip);

  // A Cloudflare fora do ar (throw, status não-OK ou corpo que não parseia)
  // é 502: indisponibilidade do lado deles, não recusa do desafio. Só um
  // "success" explicitamente falso, com a Cloudflare respondendo OK, vira
  // 403. Nunca 204 num desses casos.
  let data: { success?: boolean };
  try {
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body });
    if (!res.ok) {
      return NextResponse.json({ code: 'CAPTCHA_UNAVAILABLE' }, { status: 502 });
    }
    data = (await res.json()) as { success?: boolean };
  } catch {
    return NextResponse.json({ code: 'CAPTCHA_UNAVAILABLE' }, { status: 502 });
  }

  if (data.success !== true) {
    return NextResponse.json({ code: 'CAPTCHA_FAILED' }, { status: 403 });
  }
  return new NextResponse(null, { status: 204 });
}
