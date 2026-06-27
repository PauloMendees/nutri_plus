import { createClient } from '@/lib/supabase/client';
import { apiFetch, apiUpload } from '@/lib/api/client';

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

export async function browserApiUpload<T>(
  path: string,
  formData: FormData,
  method = 'POST',
): Promise<T> {
  const token = await browserToken();
  return apiUpload<T>(path, { token, formData, method });
}
