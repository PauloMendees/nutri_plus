import { PLAN_CATALOG, type BillingPeriod, type PlanTier } from '@nutri-plus/shared-types';

export type MetaStandardEvent =
  | 'CompleteRegistration'
  | 'InitiateCheckout'
  | 'StartTrial'
  | 'Subscribe';

export function checkoutValue(plan: PlanTier, period: BillingPeriod): number {
  const cfg = PLAN_CATALOG[plan];
  return period === 'YEARLY' ? cfg.yearlyBrl : cfg.monthlyBrl;
}

export function trackMetaEvent(event: MetaStandardEvent, params?: Record<string, unknown>): void {
  window.fbq?.('track', event, params);
}
