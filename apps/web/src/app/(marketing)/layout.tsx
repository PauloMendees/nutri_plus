import type { ReactNode } from 'react';

/** Public marketing shell — no app sidebar / billing gate. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return children;
}
