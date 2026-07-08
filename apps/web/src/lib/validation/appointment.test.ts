import { describe, it, expect } from 'vitest';
import { appointmentFormSchema } from './appointment';

const base = {
  title: 'Consulta',
  patientId: '',
  date: '2026-06-23',
  startTime: '09:00',
  endTime: '10:00',
  description: '',
};

describe('appointmentFormSchema', () => {
  it('accepts a valid appointment', () => {
    expect(appointmentFormSchema.safeParse(base).success).toBe(true);
  });

  it('requires a title', () => {
    expect(appointmentFormSchema.safeParse({ ...base, title: '' }).success).toBe(false);
  });

  it('rejects end time not after start time', () => {
    const r = appointmentFormSchema.safeParse({ ...base, startTime: '10:00', endTime: '10:00' });
    expect(r.success).toBe(false);
  });

  it('coerces empty patientId/description to undefined', () => {
    const r = appointmentFormSchema.safeParse(base);
    expect(r.success && r.data.patientId).toBeUndefined();
    expect(r.success && r.data.description).toBeUndefined();
  });
});
