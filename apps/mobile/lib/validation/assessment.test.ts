import { assessmentSchema } from './assessment';

describe('assessmentSchema', () => {
  it('requires at least one metric', () => {
    const r = assessmentSchema.safeParse({ notes: 'oi' });
    expect(r.success).toBe(false);
  });

  it('coerces a single numeric metric string and passes', () => {
    const r = assessmentSchema.safeParse({ weight: '80.5' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.weight).toBe(80.5);
  });

  it('rejects a future assessmentDate', () => {
    const r = assessmentSchema.safeParse({ weight: '80', assessmentDate: '2999-01-01' });
    expect(r.success).toBe(false);
  });

  it('rejects a non-positive weight', () => {
    const r = assessmentSchema.safeParse({ weight: '0' });
    expect(r.success).toBe(false);
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
