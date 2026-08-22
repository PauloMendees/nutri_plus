import type { ReactNode } from 'react';
import { MetaPixel } from '@/components/analytics/meta-pixel';

/**
 * Public marketing shell — no React Query, sidebar, or billing gate.
 * Theme follows the device via ThemeRoot in the root layout.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <MetaPixel />
      {children}
    </div>
  );
}
