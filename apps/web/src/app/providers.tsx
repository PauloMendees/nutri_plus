'use client';

import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { billingErrorFrom } from '@/lib/api/billing-errors';
import { emitBilling } from '@/lib/billing/billing-events';

function handle(err: unknown) {
  const be = billingErrorFrom(err);
  if (be) emitBilling(be.code, be.feature);
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handle }),
        mutationCache: new MutationCache({ onError: handle }),
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
