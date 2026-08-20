import type { PlanTier } from '@nutri-plus/shared-types';

export function parseSignupPlan(raw: string | null | undefined): PlanTier | null {
  if (raw === 'pro') return 'PRO';
  if (raw === 'essencial') return 'ESSENCIAL';
  return null;
}
