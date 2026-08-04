import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { billingErrorFrom } from '@/lib/api/billing-errors';

describe('billingErrorFrom', () => {
  it('extrai code/feature de um ApiError 402', () => {
    const err = new ApiError(402, { statusCode: 402, code: 'FEATURE_PRO_ONLY', feature: 'silhueta' });
    expect(billingErrorFrom(err)).toEqual({ code: 'FEATURE_PRO_ONLY', feature: 'silhueta' });
  });
  it('READ_ONLY sem feature', () => {
    expect(billingErrorFrom(new ApiError(402, { code: 'READ_ONLY' }))).toEqual({ code: 'READ_ONLY', feature: undefined });
  });
  it('ignora não-402 e não-ApiError', () => {
    expect(billingErrorFrom(new ApiError(403, { code: 'READ_ONLY' }))).toBeNull();
    expect(billingErrorFrom(new Error('x'))).toBeNull();
  });
});
