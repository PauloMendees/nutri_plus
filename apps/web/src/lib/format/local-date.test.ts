import { describe, it, expect } from 'vitest';
import { localDateInput } from './local-date';

describe('localDateInput', () => {
  it('uses the local calendar day, not UTC', () => {
    expect(localDateInput(new Date(2026, 7, 23, 23, 30))).toBe('2026-08-23');
  });
  it('pads month and day', () => {
    expect(localDateInput(new Date(2026, 0, 5, 8, 0))).toBe('2026-01-05');
  });
  it('holds at year boundaries', () => {
    expect(localDateInput(new Date(2026, 11, 31, 23, 0))).toBe('2026-12-31');
  });
});
