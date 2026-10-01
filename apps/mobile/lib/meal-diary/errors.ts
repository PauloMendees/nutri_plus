import { ApiError } from '../api';

export const LOCK_MESSAGE = 'Só é possível editar ou apagar uma refeição nas primeiras 24 horas.';
const GENERIC_MESSAGE = 'Não foi possível salvar. Tente novamente.';

// Mensagem do erro ao salvar uma refeição. No 400 a API explica o motivo
// (ex.: "Data inválida."); mostrá-lo evita o paciente tentar de novo sem saber
// o que corrigir.
export function mealLogErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 403) return LOCK_MESSAGE;
  if (err instanceof ApiError && err.status === 400) {
    const message = (err.body as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return GENERIC_MESSAGE;
}
