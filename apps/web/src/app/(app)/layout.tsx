import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { AppSidebar } from '@/components/app/app-sidebar';
import { BillingGate } from '@/components/billing/billing-gate';
import { OnboardingGate } from '@/components/billing/onboarding-gate';
import { FeedbackPromptHost } from '@/components/feedback/feedback-prompt-host';
import { MobileNavTrigger } from '@/components/app/mobile-nav-trigger';
import { TodayAgendaWidget } from '@/components/agenda/today-agenda-widget';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { isWebDashboardRole } from '@/lib/auth/access';
import { getCurrentUser } from '@/lib/auth/current-user';
import { Providers } from '../providers';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();

  if (me && !isWebDashboardRole(me.role)) {
    redirect('/download-app');
  }

  return (
    <Providers>
      <SidebarProvider>
        <AppSidebar user={me ? { name: me.name, email: me.email, role: me.role } : null} />
        <SidebarInset>
          <BillingGate />
          <OnboardingGate />
          {me?.role === 'NUTRITIONIST' ? <FeedbackPromptHost enabled /> : null}
          <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
            <Logo variant="full" className="h-6" />
            <MobileNavTrigger />
          </header>
          <main className="flex-1 p-6 md:p-8">{children}</main>
          <TodayAgendaWidget />
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="top-center" richColors />
    </Providers>
  );
}
