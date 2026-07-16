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
  it('rejects a percentage above 100', () => {
    const r = assessmentSchema.safeParse({ bodyFatPercentage: 150 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.message === 'Não pode passar de 100.')).toBe(true);
  });
  it('accepts a percentage of exactly 100', () => {
    expect(assessmentSchema.safeParse({ bodyFatPercentage: 100 }).success).toBe(true);
  });
  it('rejects an over-max circumference', () => {
    expect(assessmentSchema.safeParse({ waistCircumference: 9999 }).success).toBe(false);
  });
});
