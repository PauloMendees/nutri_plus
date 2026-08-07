'use client';
import { useSubscription } from '@/lib/queries/subscription';

export function AiQuotaChip() {
  const { data } = useSubscription();
  if (!data) return null;
  const { aiUsed, aiQuota } = data.entitlements;
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      IA: {aiUsed}/{aiQuota} este mês
    </span>
  );
}
