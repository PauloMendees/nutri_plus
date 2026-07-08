import { describe, it, expect } from 'vitest';
import { categoryFormSchema } from './appointment-category';

describe('categoryFormSchema', () => {
  it('accepts a valid category', () => {
    expect(
      categoryFormSchema.safeParse({ name: 'Consulta', color: '#14BFA6', isDefault: false }).success,
    ).toBe(true);
  });
  it('accepts a null color', () => {
    expect(categoryFormSchema.safeParse({ name: 'Consulta', color: null, isDefault: true }).success).toBe(
      true,
    );
  });
  it('rejects an empty name', () => {
    expect(categoryFormSchema.safeParse({ name: '', color: null, isDefault: false }).success).toBe(false);
  });
  it('rejects a malformed color', () => {
    expect(
      categoryFormSchema.safeParse({ name: 'X', color: 'red', isDefault: false }).success,
    ).toBe(false);
  });
});
