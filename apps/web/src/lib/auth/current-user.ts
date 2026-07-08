import { cache } from 'react';
import { UserRole, type MeResponse } from '@nutri-plus/shared-types';
import { createClient } from '@/lib/supabase/server';
import { getMe, syncUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

// The current dashboard user, or null when there is no session. Wrapped in
// React cache() so the (app) layout and any page calling it within the same
// request share a single network fetch. Provisions the local profile once on a
// 409 (confirmed session, no local user yet) — the same behavior the layout
// used to inline.
export const getCurrentUser = cache(async (): Promise<MeResponse | null> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;

  try {
    return await getMe(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      await syncUser(token, UserRole.NUTRITIONIST);
      return getMe(token);
    }
    throw err;
  }
});
