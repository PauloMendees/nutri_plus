import type { BillingErrorCode, PlanFeature } from '@nutri-plus/shared-types';

export type BillingEvent = { code: BillingErrorCode; feature?: PlanFeature };
type Listener = (e: BillingEvent) => void;
const listeners = new Set<Listener>();

export function emitBilling(code: BillingErrorCode, feature?: PlanFeature): void {
  for (const l of listeners) l({ code, feature });
}
export function onBilling(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
