import type { MeResponse, SyncUserRequest, UserRole } from '@nutri-plus/shared-types';
import { apiFetch } from './client';

export function getMe(token: string): Promise<MeResponse> {
  return apiFetch<MeResponse>('/auth/me', { token });
}

export function syncUser(token: string, role: UserRole): Promise<MeResponse> {
  const body: SyncUserRequest = { role };
  return apiFetch<MeResponse>('/auth/sync-user', { token, method: 'POST', body });
}
