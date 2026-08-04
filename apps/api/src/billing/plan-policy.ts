import { PLAN_CATALOG, type Entitlements, type PlanFeature, type PlanTier } from '@nutri-plus/shared-types';

export const TRIAL_DAYS = 7;
export const COURTESY_DAYS = 30;

// Início do mês em America/Sao_Paulo (UTC-3, sem DST) expresso em instante UTC.
export function saoPauloMonthStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value); // 1-12
  // 00:00 em São Paulo == 03:00 UTC.
  return new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
}

export function entitlementsForTier(tier: PlanTier, aiUsed: number): Omit<Entitlements, 'isReadOnly'> {
  const cfg = PLAN_CATALOG[tier];
  const has = (f: PlanFeature) => cfg.features.includes(f);
  return {
    tier,
    features: { silhueta: has('silhueta'), transcription: has('transcription'), employees: has('employees') },
    aiQuota: cfg.aiActionsPerMonth,
    aiUsed,
  };
}
