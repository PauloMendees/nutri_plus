import { planLabelOf, saoPauloDayStart, saoPauloMonthStart } from './plan-policy';

describe('saoPauloDayStart', () => {
  it('00:00 em São Paulo é 03:00 UTC do mesmo dia', () => {
    expect(saoPauloDayStart(new Date('2026-09-11T15:00:00Z')).toISOString()).toBe('2026-09-11T03:00:00.000Z');
  });

  it('antes das 03:00 UTC ainda é o dia anterior em São Paulo', () => {
    expect(saoPauloDayStart(new Date('2026-09-11T02:59:59Z')).toISOString()).toBe('2026-09-10T03:00:00.000Z');
  });

  it('exatamente 03:00 UTC já é o dia corrente', () => {
    expect(saoPauloDayStart(new Date('2026-09-11T03:00:00Z')).toISOString()).toBe('2026-09-11T03:00:00.000Z');
  });
});

describe('saoPauloMonthStart', () => {
  it('primeiro dia do mês às 03:00 UTC', () => {
    expect(saoPauloMonthStart(new Date('2026-09-11T15:00:00Z')).toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });
});

describe('planLabelOf', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');
  const later = new Date('2026-10-20T00:00:00.000Z');
  const earlier = new Date('2026-09-20T00:00:00.000Z');
  const base = { isComp: false, status: 'ACTIVE', plan: 'PRO' as const, currentPeriodEnd: later, trialEndsAt: null };

  it('is NONE without a subscription', () => expect(planLabelOf(null, now)).toBe('NONE'));
  it('is COMP for a courtesy, whatever the status', () =>
    expect(planLabelOf({ ...base, isComp: true, status: 'PAST_DUE', currentPeriodEnd: earlier }, now)).toBe('COMP'));
  it('is PRO for an active Pro in period', () => expect(planLabelOf(base, now)).toBe('PRO'));
  it('is ESSENCIAL for an active Essencial (or null plan) in period', () => {
    expect(planLabelOf({ ...base, plan: 'ESSENCIAL' }, now)).toBe('ESSENCIAL');
    expect(planLabelOf({ ...base, plan: null }, now)).toBe('ESSENCIAL');
  });
  it('is TRIAL for a running trial', () =>
    expect(planLabelOf({ ...base, status: 'TRIALING', plan: null, currentPeriodEnd: null, trialEndsAt: later }, now)).toBe('TRIAL'));
  // Vencida = já foi assinante pago (teve período) e o período acabou ou o
  // pagamento não foi feito.
  it('is EXPIRED for a former paying subscriber whose period is over', () => {
    expect(planLabelOf({ ...base, currentPeriodEnd: earlier }, now)).toBe('EXPIRED');
    expect(planLabelOf({ ...base, status: 'PAST_DUE', currentPeriodEnd: earlier }, now)).toBe('EXPIRED');
    expect(planLabelOf({ ...base, status: 'CANCELED', currentPeriodEnd: earlier }, now)).toBe('EXPIRED');
  });

  // Teste encerrado = usou o teste grátis e nunca pagou (não assinante).
  it('is TRIAL_ENDED when the trial is over and there was never a paid period', () => {
    expect(planLabelOf({ ...base, status: 'TRIALING', plan: null, currentPeriodEnd: null, trialEndsAt: earlier }, now)).toBe('TRIAL_ENDED');
    expect(planLabelOf({ ...base, status: 'PAST_DUE', currentPeriodEnd: null, trialEndsAt: earlier }, now)).toBe('TRIAL_ENDED');
  });

  it('is NONE for a checkout that never paid nor trialed', () => {
    expect(planLabelOf({ ...base, status: 'PAST_DUE', currentPeriodEnd: null, trialEndsAt: null }, now)).toBe('NONE');
  });
});
