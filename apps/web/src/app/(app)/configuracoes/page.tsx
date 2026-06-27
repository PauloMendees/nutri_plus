import { SettingsView } from '@/components/settings/settings-view';
import { Unauthorized } from '@/components/auth/unauthorized';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManageSettings } from '@/lib/auth/access';

export default async function SettingsPage() {
  const me = await getCurrentUser();
  if (!me || !canManageSettings(me.role)) {
    return <Unauthorized />;
  }
  return <SettingsView />;
}
