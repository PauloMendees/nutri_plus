import { describe, it, expect } from 'vitest';
import { inviteEmployeeSchema, updateEmployeeSchema } from './employee';

describe('inviteEmployeeSchema', () => {
  it('accepts a valid name and email', () => {
    expect(
      inviteEmployeeSchema.safeParse({ name: 'Ana Paula', email: 'ana@x.com' }).success,
    ).toBe(true);
  });

  it('rejects a name shorter than 2 chars', () => {
    expect(inviteEmployeeSchema.safeParse({ name: 'A', email: 'ana@x.com' }).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(inviteEmployeeSchema.safeParse({ name: 'Ana Paula', email: 'nope' }).success).toBe(false);
  });
});

describe('updateEmployeeSchema', () => {
  it('accepts a valid name', () => {
    expect(updateEmployeeSchema.safeParse({ name: 'Ana Paula' }).success).toBe(true);
  });

  it('rejects a name shorter than 2 chars', () => {
    expect(updateEmployeeSchema.safeParse({ name: 'A' }).success).toBe(false);
  });
});
