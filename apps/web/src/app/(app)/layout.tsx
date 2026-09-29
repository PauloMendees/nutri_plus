import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { MetaPixel } from '@/components/analytics/meta-pixel';
import { AppSidebar } from '@/components/app/app-sidebar';
import { BillingGate } from '@/components/billing/billing-gate';
import { OnboardingGate } from '@/components/billing/onboarding-gate';
import { FeedbackPromptHost } from '@/components/feedback/feedback-prompt-host';
import { FirstRunHost } from '@/components/onboarding/first-run-host';
import { TourProvider } from '@/components/onboarding/tour-provider';
import { MobileNavTrigger } from '@/components/app/mobile-nav-trigger';
import { CornerWidgets } from '@/components/app/corner-widgets';
import { RecordingFloater } from '@/components/recording/recording-floater';
import { RecordingProvider } from '@/components/recording/recording-provider';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { isWebDashboardRole } from '@/lib/auth/access';
import { getCurrentUser } from '@/lib/auth/current-user';
import { displayNameOf } from '@/lib/auth/display-name';
import { Providers } from '../providers';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();

  if (me && !isWebDashboardRole(me.role)) {
    redirect('/download-app');
  }

  return (
    <Providers>
      {/* Sem PageView: o pixel entra aqui só para o evento TrialAtivado ter
          onde disparar no navegador e poder ser deduplicado com a CAPI. */}
      <MetaPixel trackPageView={false} />
      <RecordingProvider>
        <SidebarProvider>
          <AppSidebar user={me ? { name: displayNameOf(me), email: me.email, role: me.role } : null} />
          <SidebarInset>
            <TourProvider role={me?.role ?? null}>
              <BillingGate />
              <OnboardingGate />
              <FirstRunHost />
              {me?.role === 'NUTRITIONIST' ? <FeedbackPromptHost enabled /> : null}
              <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
                <Logo variant="full" className="h-6" />
                <MobileNavTrigger />
              </header>
              {/* pb-32 no mobile: o floater de gravação fica fixo no rodapé e
                  cobriria o fim do conteúdo sem essa folga. */}
              <main className="flex-1 p-6 pb-32 md:p-8 md:pb-32">{children}</main>
              <CornerWidgets />
              {/* useSearchParams exige Suspense no App Router. */}
              <Suspense fallback={null}>
                <RecordingFloater />
              </Suspense>
            </TourProvider>
          </SidebarInset>
        </SidebarProvider>
      </RecordingProvider>
      <Toaster position="top-center" richColors />
    </Providers>
  );
}
