import { describe, it, expect } from 'vitest';
import { mealPlanSchema } from './meal-plan';

const base = { title: '', objective: '', targetCalories: '', targetProtein: '', targetCarbs: '', targetFats: '', meals: [] };

describe('mealPlanSchema', () => {
  it('accepts an empty draft (all optional)', () => {
    expect(mealPlanSchema.safeParse(base).success).toBe(true);
  });
  it('coerces macro strings to numbers', () => {
    const r = mealPlanSchema.safeParse({
      ...base,
      meals: [{ name: 'Café', timeLabel: '08:00', instructions: '', options: [{ label: 'Opção 1', items: [{ foodName: 'Ovos', quantity: '3', calories: '230', protein: '18', carbs: '2', fats: '16' }] }] }],
    });
    expect(r.success && r.data.meals[0].options[0].items[0].calories).toBe(230);
  });
  it('rejects a negative macro', () => {
    const r = mealPlanSchema.safeParse({
      ...base,
      meals: [{ name: 'X', options: [{ label: 'Opção 1', items: [{ foodName: 'Y', calories: '-5' }] }] }],
    });
    expect(r.success).toBe(false);
  });
  it('rejects a title over 200 chars', () => {
    expect(mealPlanSchema.safeParse({ ...base, title: 'a'.repeat(201) }).success).toBe(false);
  });
});
