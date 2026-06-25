import { describe, it, expect } from 'vitest';
import { assessmentSchema } from './assessment';

describe('assessmentSchema', () => {
  it('accepts a single numeric metric', () => {
    expect(assessmentSchema.safeParse({ weight: '80' }).success).toBe(true);
  });
  it('coerces metric strings to numbers', () => {
    const r = assessmentSchema.safeParse({ weight: '80.5' });
    expect(r.success && r.data.weight).toBe(80.5);
  });
  it('rejects an empty payload (no metric)', () => {
    expect(assessmentSchema.safeParse({}).success).toBe(false);
  });
  it('rejects when only date/notes are present', () => {
    expect(
      assessmentSchema.safeParse({ assessmentDate: '2026-01-01', notes: 'oi' }).success,
    ).toBe(false);
  });
  it('rejects a future assessmentDate', () => {
    expect(assessmentSchema.safeParse({ weight: '80', assessmentDate: '2999-01-01' }).success).toBe(false);
  });
  it('rejects a non-positive weight', () => {
    expect(assessmentSchema.safeParse({ weight: '0' }).success).toBe(false);
  });
});
