import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { AppSidebar } from '@/components/app/app-sidebar';
import { MobileNavTrigger } from '@/components/app/mobile-nav-trigger';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { isWebDashboardRole } from '@/lib/auth/access';
import { getCurrentUser } from '@/lib/auth/current-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();

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
