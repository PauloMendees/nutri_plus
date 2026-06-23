import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/api/client';

export async function browserToken(): Promise<string> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sessão expirada. Entre novamente.');
  }
  return session.access_token;
}

export async function browserApiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await browserToken();
  return apiFetch<T>(path, { token, ...opts });
}
