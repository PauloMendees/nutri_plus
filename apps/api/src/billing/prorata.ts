import { PLAN_CATALOG, type BillingPeriod, type PlanTier } from '@nutri-plus/shared-types';

const TIER_RANK: Record<PlanTier, number> = { ESSENCIAL: 0, PRO: 1 };

export function planValue(plan: PlanTier, period: BillingPeriod): number {
  const c = PLAN_CATALOG[plan];
  return period === 'MONTHLY' ? c.monthlyBrl : c.yearlyBrl;
}

export type PlanChangeComputation =
  | {
      kind: 'UPGRADE';
      amountNow: number;
      recurringValue: number;
      recurringPeriod: BillingPeriod;
      effectiveDate: Date;
    }
  | {
      kind: 'SCHEDULED';
      amountNow: 0;
      recurringValue: number;
      recurringPeriod: BillingPeriod;
      effectiveDate: Date;
    };

/**
 * Upgrade charge is remainingTime / actualCycleLength of the price difference.
 * The cycle length is the calendar month (or year) ending at `currentPeriodEnd`,
 * not a hardcoded 30/365 — otherwise a 31-day span bills more than the full gap.
 */
export function computePlanChange(input: {
  currentPlan: PlanTier;
  currentPeriod: BillingPeriod;
  currentPeriodEnd: Date;
  newPlan: PlanTier;
  newPeriod: BillingPeriod;
  now?: Date;
}): PlanChangeComputation {
  const now = input.now ?? new Date();
  const newValue = planValue(input.newPlan, input.newPeriod);
  const isUpgrade =
    input.newPeriod === input.currentPeriod && TIER_RANK[input.newPlan] > TIER_RANK[input.currentPlan];

  if (!isUpgrade) {
    return {
      kind: 'SCHEDULED',
      amountNow: 0,
      recurringValue: newValue,
      recurringPeriod: input.newPeriod,
      effectiveDate: input.currentPeriodEnd,
    };
  }

  const cur = planValue(input.currentPlan, input.currentPeriod);
  const fullDiff = newValue - cur;
  const cycleStart = new Date(input.currentPeriodEnd);
  if (input.currentPeriod === 'YEARLY') cycleStart.setUTCFullYear(cycleStart.getUTCFullYear() - 1);
  else cycleStart.setUTCMonth(cycleStart.getUTCMonth() - 1);

  const cycleMs = Math.max(1, input.currentPeriodEnd.getTime() - cycleStart.getTime());
  const remainingMs = Math.max(0, input.currentPeriodEnd.getTime() - now.getTime());
  const fraction = Math.min(1, remainingMs / cycleMs);
  const amountNow = Math.round(fullDiff * fraction * 100) / 100;

  return {
    kind: 'UPGRADE',
    amountNow,
    recurringValue: newValue,
    recurringPeriod: input.newPeriod,
    effectiveDate: input.currentPeriodEnd,
  };
}
