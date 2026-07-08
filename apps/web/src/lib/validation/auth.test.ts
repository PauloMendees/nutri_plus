import { describe, it, expect } from 'vitest';
import { loginSchema, signupSchema, forgotPasswordSchema, resetPasswordSchema } from './auth';

describe('loginSchema', () => {
  it('accepts a valid email + password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });
  it('rejects an invalid email', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
  });
});

describe('signupSchema', () => {
  const base = {
    name: 'Dra. Ana',
    email: 'ana@clinica.com',
    password: 'supersecret',
    confirmPassword: 'supersecret',
  };
  it('accepts a valid payload', () => {
    expect(signupSchema.safeParse(base).success).toBe(true);
  });
  it('rejects when passwords do not match', () => {
    const r = signupSchema.safeParse({ ...base, confirmPassword: 'different' });
    expect(r.success).toBe(false);
  });
  it('rejects a short password', () => {
    expect(
      signupSchema.safeParse({ ...base, password: 'short', confirmPassword: 'short' }).success,
    ).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.com' }).success).toBe(true);
  });
  it('rejects an invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  const base = { password: 'supersecret', confirmPassword: 'supersecret' };
  it('accepts matching passwords of length >= 8', () => {
    expect(resetPasswordSchema.safeParse(base).success).toBe(true);
  });
  it('rejects a short password', () => {
    expect(
      resetPasswordSchema.safeParse({ password: 'short', confirmPassword: 'short' }).success,
    ).toBe(false);
  });
  it('rejects mismatched passwords', () => {
    expect(
      resetPasswordSchema.safeParse({ ...base, confirmPassword: 'different' }).success,
    ).toBe(false);
  });
});
