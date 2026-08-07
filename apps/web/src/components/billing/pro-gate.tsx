'use client';
import type { PlanFeature } from '@nutri-plus/shared-types';
import { Lock } from 'lucide-react';
import { useSubscription } from '@/lib/queries/subscription';
import { emitBilling } from '@/lib/billing/billing-events';
import { Button } from '@/components/ui/button';

export function useFeature(feature: PlanFeature): boolean {
  const { data } = useSubscription();
  return data?.entitlements.features[feature] ?? false;
}

// Se a feature está liberada, renderiza os filhos. Senão, mostra um botão com
// cadeado que abre o upsell (reaproveita o modal do BillingGate via emitBilling).
export function ProGate({
  feature,
  children,
  label,
}: {
  feature: PlanFeature;
  children: React.ReactNode;
  label?: string;
}) {
  const allowed = useFeature(feature);
  if (allowed) return <>{children}</>;
  return (
    <Button
      type="button"
      variant="outline"
      className="rounded-full text-muted-foreground"
      onClick={() => emitBilling('FEATURE_PRO_ONLY', feature)}
    >
      <Lock className="h-4 w-4" /> {label ?? 'Recurso Pro'}
    </Button>
  );
}
