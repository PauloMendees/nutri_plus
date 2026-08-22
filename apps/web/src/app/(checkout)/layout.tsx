import { Suspense } from 'react';
import { Logo } from '@/components/brand/logo';
import { MetaPixel } from '@/components/analytics/meta-pixel';
import { Providers } from '../providers';

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <MetaPixel />
      <div className="min-h-screen bg-background">
        <header className="flex justify-center border-b p-4">
          <Logo variant="full" className="h-7" />
        </header>
        <main className="mx-auto max-w-3xl px-4 py-8 md:py-12">
          <Suspense>{children}</Suspense>
        </main>
      </div>
    </Providers>
  );
}
