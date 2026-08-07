import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../generated/prisma/client';
import { SubscriptionGuard } from './subscription.guard';
import { PaymentRequiredException } from './payment-required.exception';

function ctx(method: string, user: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}
const nutri = { user: { role: UserRole.NUTRITIONIST, nutritionistProfile: { id: 'n1' } } };
const patient = { user: { role: UserRole.PATIENT, patientProfile: { id: 'p1' } } };

function makeGuard(meta: Partial<{ isPublic: boolean; exempt: boolean; feature: string }>, entitlements: any) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === 'isPublic') return meta.isPublic;
      if (key === 'billingExempt') return meta.exempt;
      if (key === 'requiresFeature') return meta.feature;
      return undefined;
    }),
  } as unknown as Reflector;
  const ent = { getEntitlements: jest.fn().mockResolvedValue(entitlements) } as any;
  return new SubscriptionGuard(reflector, ent);
}

describe('SubscriptionGuard', () => {
  it('libera rota @Public', async () => {
    const g = makeGuard({ isPublic: true }, null);
    expect(await g.canActivate(ctx('POST', null))).toBe(true);
  });
  it('libera role PATIENT (escrita)', async () => {
    const g = makeGuard({}, null);
    expect(await g.canActivate(ctx('POST', patient))).toBe(true);
  });
  it('libera GET mesmo em read-only', async () => {
    const g = makeGuard({}, { isReadOnly: true, features: {} });
    expect(await g.canActivate(ctx('GET', nutri))).toBe(true);
  });
  it('libera rota @BillingExempt (escrita)', async () => {
    const g = makeGuard({ exempt: true }, { isReadOnly: true, features: {} });
    expect(await g.canActivate(ctx('POST', nutri))).toBe(true);
  });
  it('bloqueia escrita de nutri em read-only → READ_ONLY', async () => {
    const g = makeGuard({}, { isReadOnly: true, features: {} });
    await expect(g.canActivate(ctx('POST', nutri))).rejects.toBeInstanceOf(PaymentRequiredException);
  });
  it('bloqueia @RequiresFeature sem direito → FEATURE_PRO_ONLY', async () => {
    const g = makeGuard({ feature: 'silhueta' }, { isReadOnly: false, features: { silhueta: false } });
    await expect(g.canActivate(ctx('POST', nutri))).rejects.toBeInstanceOf(PaymentRequiredException);
  });
  it('libera @RequiresFeature com direito', async () => {
    const g = makeGuard({ feature: 'silhueta' }, { isReadOnly: false, features: { silhueta: true } });
    expect(await g.canActivate(ctx('POST', nutri))).toBe(true);
  });
});
