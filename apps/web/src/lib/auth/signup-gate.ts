export const CAPTCHA_FAILED_MESSAGE =
  'Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.';

/** Site key pública do Turnstile. Ausente em dev/testes: o gate fica desligado. */
export function turnstileSiteKey(): string | undefined {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined;
}

export type SignupGateResult = 'ok' | 'captcha_failed' | 'error';

/** Verifica o token no servidor (route handler) antes do signUp. */
export async function verifySignupGate(token: string): Promise<SignupGateResult> {
  try {
    const res = await fetch('/api/signup-gate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (res.status === 204) return 'ok';
    if (res.status === 403) return 'captcha_failed';
    return 'error';
  } catch {
    return 'error';
  }
}
