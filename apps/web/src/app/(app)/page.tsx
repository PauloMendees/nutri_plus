import { UserRole, type MeResponse } from '@nutri-plus/shared-types';
import { createClient } from '@/lib/supabase/server';
import { getMe, syncUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function loadProfile(token: string): Promise<MeResponse> {
  try {
    return await getMe(token);
  } catch (err) {
    // Confirmed session but no local profile yet: provision once, then refetch.
    if (err instanceof ApiError && err.status === 409) {
      await syncUser(token, UserRole.NUTRITIONIST);
      return getMe(token);
    }
    throw err;
  }
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const me = session?.access_token ? await loadProfile(session.access_token) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl">
          Bem-vindo{me ? `, ${me.name}` : ''} 👋
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <p>Você está autenticado no iNutri.</p>
        {me && (
          <p>
            Perfil: <span className="font-medium text-foreground">{me.role}</span> · {me.email}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
