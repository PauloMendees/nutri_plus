import type { ReactNode } from 'react';

/**
 * Public marketing shell — no app providers, sidebar, or billing gate.
 * Forced light palette so brand greens keep WCAG contrast (dark mode in the
 * app uses ThemeProvider only under (app)).
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-svh bg-background text-foreground">{children}</div>;
}
