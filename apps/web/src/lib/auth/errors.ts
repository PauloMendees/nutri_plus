const MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha inválidos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  weak_password: 'A senha é muito fraca. Use ao menos 8 caracteres.',
  over_email_send_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  same_password: 'A nova senha deve ser diferente da atual.',
};

const GENERIC = 'Algo deu errado. Tente novamente.';

/** Map a Supabase auth error (or anything) to a friendly pt-BR message. */
export function mapAuthError(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: string }).code;
    if (code && MESSAGES[code]) return MESSAGES[code];
  }
  return GENERIC;
}
