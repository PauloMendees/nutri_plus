import { HubView } from '@/components/onboarding/hub-view';
import { getCurrentUser } from '@/lib/auth/current-user';

export default async function PrimeirosPassosPage() {
  const me = await getCurrentUser();
  return <HubView role={me?.role ?? null} />;
}
