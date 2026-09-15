import { ApiError } from '@/lib/api/client';

const MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'Muitas solicitações. Aguarde um minuto e tente de novo.',
  AI_DAILY_CAP_EXCEEDED: 'Limite diário de IA atingido. Tente amanhã.',
};

/** 429 da API → mensagem pt-BR por `code`; null para qualquer outro erro. */
export function rateLimitMessageFrom(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 429) return null;
  const code = (err.body as { code?: string } | null)?.code;
  return (code && MESSAGES[code]) || MESSAGES.RATE_LIMITED;
}
