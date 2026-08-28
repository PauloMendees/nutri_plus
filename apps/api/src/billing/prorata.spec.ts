import { computePlanChange, planValue } from './prorata';

// Derivados do catálogo: estes testes são sobre o rateio, não sobre o preço.
const PRO_MONTHLY = planValue('PRO', 'MONTHLY');
const ESSENCIAL_MONTHLY = planValue('ESSENCIAL', 'MONTHLY');
const FULL_DIFF = PRO_MONTHLY - ESSENCIAL_MONTHLY;

describe('computePlanChange', () => {
  const now = new Date('2026-08-19T21:00:00.000Z');

  it('never charges more than the full monthly difference on a 31-day cycle', () => {
    // nextPeriodEnd(now) via setUTCMonth(+1) is exactly 31 days later.
    const currentPeriodEnd = new Date(now);
    currentPeriodEnd.setUTCMonth(currentPeriodEnd.getUTCMonth() + 1);

    const out = computePlanChange({
      currentPlan: 'ESSENCIAL',
      currentPeriod: 'MONTHLY',
      currentPeriodEnd,
      newPlan: 'PRO',
      newPeriod: 'MONTHLY',
      now,
    });

    expect(out.kind).toBe('UPGRADE');
    if (out.kind !== 'UPGRADE') return;
    expect(out.amountNow).toBeLessThanOrEqual(FULL_DIFF);
    expect(out.amountNow).toBe(FULL_DIFF);
    expect(out.recurringValue).toBe(PRO_MONTHLY);
  });

  it('prorates by remaining / actual cycle length, not a hardcoded 30 days', () => {
    const currentPeriodEnd = new Date('2026-09-03T21:00:00.000Z');
    const cycleStart = new Date(currentPeriodEnd);
    cycleStart.setUTCMonth(cycleStart.getUTCMonth() - 1);
    const remainingMs = currentPeriodEnd.getTime() - now.getTime();
    const cycleMs = currentPeriodEnd.getTime() - cycleStart.getTime();
    const expected = Math.round(FULL_DIFF * (remainingMs / cycleMs) * 100) / 100;

    const out = computePlanChange({
      currentPlan: 'ESSENCIAL',
      currentPeriod: 'MONTHLY',
      currentPeriodEnd,
      newPlan: 'PRO',
      newPeriod: 'MONTHLY',
      now,
    });

    expect(out.kind).toBe('UPGRADE');
    if (out.kind !== 'UPGRADE') return;
    expect(out.amountNow).toBe(expected);
    expect(out.amountNow).toBeLessThan(FULL_DIFF);
  });

  it('schedules downgrade without charging now', () => {
    const out = computePlanChange({
      currentPlan: 'PRO',
      currentPeriod: 'MONTHLY',
      currentPeriodEnd: new Date('2026-09-18T00:00:00.000Z'),
      newPlan: 'ESSENCIAL',
      newPeriod: 'MONTHLY',
      now,
    });
    expect(out).toMatchObject({ kind: 'SCHEDULED', amountNow: 0, recurringValue: ESSENCIAL_MONTHLY });
  });
});
