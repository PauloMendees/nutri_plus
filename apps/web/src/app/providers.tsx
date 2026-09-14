'use client';

import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { billingErrorFrom } from '@/lib/api/billing-errors';
import { rateLimitMessageFrom } from '@/lib/api/rate-limit-errors';
import { emitBilling } from '@/lib/billing/billing-events';

function handle(err: unknown) {
  const be = billingErrorFrom(err);
  if (be) emitBilling(be.code, be.feature);
  // Rate limit e teto diário de IA: aviso único, no lugar do erro genérico de
  // cada tela. O <Toaster> vive no layout autenticado.
  const rl = rateLimitMessageFrom(err);
  if (rl) toast.error(rl);
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
