import { describe, it, expect } from 'vitest';
import { formatIsoDateUtc } from './date';

describe('formatIsoDateUtc', () => {
  it('keeps the calendar day of a date-only UTC midnight (no Brazil off-by-one)', () => {
    // 2026-08-19T00:00:00.000Z is 18/08 21:00 in America/Sao_Paulo.
    expect(formatIsoDateUtc('2026-08-19T00:00:00.000Z')).toBe('19/08/2026');
  });

  it('returns an em dash for null', () => {
    expect(formatIsoDateUtc(null)).toBe('—');
  });
});
