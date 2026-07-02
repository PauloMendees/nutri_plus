const GENERIC = 'Algo deu errado. Tente novamente.';

export function mapAuthError(error: { message?: string } | null | undefined): string {
  const msg = error?.message?.toLowerCase() ?? '';
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar.';
  }
  return GENERIC;
}
