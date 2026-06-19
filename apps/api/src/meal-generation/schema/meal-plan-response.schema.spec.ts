import { mealPlanResponseSchema } from './meal-plan-response.schema';

const valid = {
  title: 'Weight Loss Plan',
  meals: [
    {
      name: 'Breakfast',
      timeLabel: '08:00',
      items: [{ foodName: 'Eggs', quantity: '2 units' }],
    },
  ],
};

describe('mealPlanResponseSchema', () => {
  it('accepts a well-formed plan', () => {
    expect(mealPlanResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a null timeLabel', () => {
    const r = mealPlanResponseSchema.safeParse({
      ...valid,
      meals: [{ ...valid.meals[0], timeLabel: null }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty meals array', () => {
    expect(
      mealPlanResponseSchema.safeParse({ title: 'x', meals: [] }).success,
    ).toBe(false);
  });

  it('rejects a meal with no items', () => {
    expect(
      mealPlanResponseSchema.safeParse({
        title: 'x',
        meals: [{ name: 'Breakfast', timeLabel: null, items: [] }],
      }).success,
    ).toBe(false);
  });

  it('rejects a missing foodName', () => {
    expect(
      mealPlanResponseSchema.safeParse({
        title: 'x',
        meals: [{ name: 'B', timeLabel: null, items: [{ quantity: '2' }] }],
      }).success,
    ).toBe(false);
  });
});
