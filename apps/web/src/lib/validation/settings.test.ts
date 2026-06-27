import { describe, it, expect } from 'vitest';
import { settingsSchema } from './settings';

describe('settingsSchema', () => {
  it('accepts a valid display name and instructions', () => {
    expect(settingsSchema.safeParse({ displayName: 'Dra. Ana', mealPlanAiInstructions: 'Sem lactose' }).success).toBe(true);
  });
  it('accepts empty fields (optional)', () => {
    expect(settingsSchema.safeParse({ displayName: '', mealPlanAiInstructions: '' }).success).toBe(true);
  });
  it('rejects a display name over 120 chars', () => {
    expect(settingsSchema.safeParse({ displayName: 'a'.repeat(121) }).success).toBe(false);
  });
});
