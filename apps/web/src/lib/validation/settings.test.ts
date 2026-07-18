import { describe, it, expect } from 'vitest';
import { settingsSchema } from './settings';

const bools = { defaultCanLogAssessments: false, defaultShowMealTargetToPatient: false };

describe('settingsSchema', () => {
  it('accepts a valid display name and instructions', () => {
    expect(
      settingsSchema.safeParse({ displayName: 'Dra. Ana', mealPlanAiInstructions: 'Sem lactose', ...bools })
        .success,
    ).toBe(true);
  });
  it('accepts empty fields (optional)', () => {
    expect(
      settingsSchema.safeParse({ displayName: '', mealPlanAiInstructions: '', ...bools }).success,
    ).toBe(true);
  });
  it('rejects a display name over 120 chars', () => {
    expect(settingsSchema.safeParse({ displayName: 'a'.repeat(121), ...bools }).success).toBe(false);
  });
  it('requires the two default booleans', () => {
    expect(settingsSchema.safeParse({ displayName: 'Dra. Ana' }).success).toBe(false);
  });
  it('accepts the two default booleans as true', () => {
    expect(
      settingsSchema.safeParse({
        defaultCanLogAssessments: true,
        defaultShowMealTargetToPatient: true,
      }).success,
    ).toBe(true);
  });
});
