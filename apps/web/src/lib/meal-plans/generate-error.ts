import { ApiError } from '@/lib/api/client';

// The generate endpoint 422s with: "Cannot generate a plan: missing <tokens>".
// Map the known tokens to pt-BR labels; returns null when it isn't a 422.
const TOKEN_LABELS: { token: string; label: string }[] = [
  { token: 'weight', label: 'peso (na bioimpedância)' },
  { token: 'height', label: 'altura' },
  { token: 'birthDate', label: 'data de nascimento' },
  { token: 'gender', label: 'gênero' },
  { token: 'objective', label: 'objetivo' },
  { token: 'activityLevel', label: 'nível de atividade' },
];

export function missingFieldsFromError(err: unknown): string[] | null {
  if (!(err instanceof ApiError) || err.status !== 422) return null;
  const body = err.body as { message?: string } | null;
  const message = typeof body?.message === 'string' ? body.message : '';
  const found = TOKEN_LABELS.filter(({ token }) => message.includes(token)).map((t) => t.label);
  return found.length > 0 ? found : ['o cadastro do paciente'];
}
