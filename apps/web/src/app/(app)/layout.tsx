import { UserRole, type MeResponse } from '@nutri-plus/shared-types';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe, syncUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { Logo } from '@/components/brand/logo';
import { AppSidebar } from '@/components/app/app-sidebar';
import { MobileNavTrigger } from '@/components/app/mobile-nav-trigger';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { isWebDashboardRole } from '@/lib/auth/access';

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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const me = session?.access_token ? await loadProfile(session.access_token) : null;

  if (me && !isWebDashboardRole(me.role)) {
    redirect('/download-app');
  }

  return (
    <SidebarProvider>
      <AppSidebar user={me ? { name: me.name, role: me.role } : null} />
      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
          <Logo variant="full" className="h-6" />
          <MobileNavTrigger />
        </header>
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
