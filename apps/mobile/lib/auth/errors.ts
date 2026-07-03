const GENERIC = 'Algo deu errado. Tente novamente.';

// Supabase auth errors carry a stable `code`; prefer it, then fall back to
// `message` substrings for errors that only set a message (keeps older login
// behavior working).
const CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha inválidos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  otp_expired: 'Código inválido ou expirado. Peça um novo.',
  weak_password: 'A senha é muito fraca. Use ao menos 8 caracteres.',
  same_password: 'A nova senha deve ser diferente da atual.',
  over_email_send_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
};

export function mapAuthError(error: { code?: string; message?: string } | null | undefined): string {
  const code = error?.code;
  if (code && CODE_MESSAGES[code]) {
    return CODE_MESSAGES[code];
  }

  const msg = error?.message?.toLowerCase() ?? '';
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar.';
  }
  if (msg.includes('otp') || msg.includes('token') || msg.includes('expired')) {
    return 'Código inválido ou expirado. Peça um novo.';
  }
  if (msg.includes('weak password') || msg.includes('password should be at least')) {
    return 'A senha é muito fraca. Use ao menos 8 caracteres.';
  }
  if (msg.includes('should be different') || msg.includes('different from the old')) {
    return 'A nova senha deve ser diferente da atual.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  }
  return GENERIC;
}
