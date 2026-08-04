import type { BillingErrorCode, PlanFeature } from '@nutri-plus/shared-types';
import { ApiError } from '@/lib/api/client';

const CODES: BillingErrorCode[] = ['READ_ONLY', 'AI_QUOTA_EXCEEDED', 'FEATURE_PRO_ONLY', 'SEAT_LIMIT'];

export function billingErrorFrom(err: unknown): { code: BillingErrorCode; feature?: PlanFeature } | null {
  if (!(err instanceof ApiError) || err.status !== 402) return null;
  const body = err.body as { code?: string; feature?: PlanFeature } | null;
  if (!body || !CODES.includes(body.code as BillingErrorCode)) return null;
  return { code: body.code as BillingErrorCode, feature: body.feature };
}
