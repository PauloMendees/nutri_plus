import { describe, it, expect } from 'vitest';
import {
  monthGrid,
  gridRange,
  combineDateTime,
  toDateInput,
  toTimeInput,
  sameDay,
  formatMonthTitle,
  formatTime,
  groupByDay,
} from './dates';

describe('monthGrid', () => {
  it('returns 42 Sunday-first cells covering June 2026', () => {
    const grid = monthGrid(2026, 5, new Date(2026, 5, 23));
    expect(grid).toHaveLength(42);
    // June 1 2026 is a Monday, so cell 0 is Sunday May 31.
    expect(toDateInput(grid[0].date)).toBe('2026-05-31');
    expect(grid[0].inMonth).toBe(false);
    expect(grid[1].inMonth).toBe(true); // June 1
    const today = grid.find((c) => c.isToday);
    expect(today && toDateInput(today.date)).toBe('2026-06-23');
  });
});

describe('gridRange', () => {
  it('spans the first visible cell to the day after the last', () => {
    const { from, to } = gridRange(2026, 5);
    expect(toDateInput(from)).toBe('2026-05-31');
    // Last visible cell is Jul 11 2026; the exclusive end is the day after.
    expect(toDateInput(to)).toBe('2026-07-12');
  });
});

describe('combineDateTime / inputs', () => {
  it('round-trips a date and time', () => {
    const d = combineDateTime('2026-06-23', '08:30');
    expect(toDateInput(d)).toBe('2026-06-23');
    expect(toTimeInput(d)).toBe('08:30');
  });
});

describe('sameDay', () => {
  it('compares calendar days ignoring time', () => {
    expect(sameDay(new Date(2026, 5, 23, 1), new Date(2026, 5, 23, 23))).toBe(true);
    expect(sameDay(new Date(2026, 5, 23), new Date(2026, 5, 24))).toBe(false);
  });
});

describe('formatting', () => {
  it('formats a month title in pt-BR, capitalized', () => {
    expect(formatMonthTitle(2026, 5)).toBe('Junho 2026');
  });
  it('formats a single time as HH:mm', () => {
    expect(formatTime(combineDateTime('2026-06-23', '08:30').toISOString())).toBe('08:30');
  });
});

describe('groupByDay', () => {
  it('buckets appointments by their local start day', () => {
    const a = combineDateTime('2026-06-23', '08:30').toISOString();
    const b = combineDateTime('2026-06-23', '14:00').toISOString();
    const c = combineDateTime('2026-06-24', '09:00').toISOString();
    const map = groupByDay([{ startsAt: a }, { startsAt: b }, { startsAt: c }]);
    expect(map.get('2026-06-23')).toHaveLength(2);
    expect(map.get('2026-06-24')).toHaveLength(1);
  });
});
