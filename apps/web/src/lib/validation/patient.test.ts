import { describe, it, expect } from 'vitest';
import { createPatientSchema, updatePatientSchema } from './patient';

describe('createPatientSchema', () => {
  it('accepts name + email with empty clinical fields', () => {
    const r = createPatientSchema.safeParse({ name: 'Maria Silva', email: 'maria@x.com' });
    expect(r.success).toBe(true);
  });
  it('requires a name and a valid email', () => {
    expect(createPatientSchema.safeParse({ name: 'M', email: 'maria@x.com' }).success).toBe(false);
    expect(createPatientSchema.safeParse({ name: 'Maria', email: 'nope' }).success).toBe(false);
  });
  it('coerces height and rejects non-positive', () => {
    const ok = createPatientSchema.safeParse({ name: 'Maria', email: 'm@x.com', height: '170' });
    expect(ok.success && ok.data.height).toBe(170);
    expect(createPatientSchema.safeParse({ name: 'Maria', email: 'm@x.com', height: '0' }).success).toBe(false);
  });
  it('treats empty optional strings as omitted', () => {
    const r = createPatientSchema.safeParse({ name: 'Maria', email: 'm@x.com', notes: '', gender: '' });
    expect(r.success && r.data.notes).toBeUndefined();
    expect(r.success && r.data.gender).toBeUndefined();
  });
  it('rejects a future birthDate', () => {
    expect(
      createPatientSchema.safeParse({ name: 'Maria', email: 'm@x.com', birthDate: '2999-01-01' }).success,
    ).toBe(false);
  });
});

describe('updatePatientSchema', () => {
  it('accepts an all-empty (no-op) update', () => {
    expect(updatePatientSchema.safeParse({}).success).toBe(true);
  });
  it('validates an enum value', () => {
    expect(updatePatientSchema.safeParse({ objective: 'WEIGHT_LOSS' }).success).toBe(true);
    expect(updatePatientSchema.safeParse({ objective: 'NOPE' }).success).toBe(false);
  });
});
