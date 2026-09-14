import { saoPauloDayStart, saoPauloMonthStart } from './plan-policy';

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
