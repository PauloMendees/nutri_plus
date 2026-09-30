import { saoPauloCalendarDate } from './calendar-date';

describe('saoPauloCalendarDate', () => {
  it('keeps the São Paulo day of an afternoon instant, at midnight UTC', () => {
    expect(saoPauloCalendarDate(new Date('2026-09-29T15:00:00.000Z')).toISOString()).toBe(
      '2026-09-29T00:00:00.000Z',
    );
  });

  it('uses the São Paulo day for a late-evening instant that is already tomorrow in UTC', () => {
    // 29/09 23:30 em São Paulo == 30/09 02:30 UTC.
    expect(saoPauloCalendarDate(new Date('2026-09-30T02:30:00.000Z')).toISOString()).toBe(
      '2026-09-29T00:00:00.000Z',
    );
  });
});
