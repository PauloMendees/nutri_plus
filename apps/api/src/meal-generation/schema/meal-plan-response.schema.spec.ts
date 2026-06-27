import { mealPlanResponseSchema } from './meal-plan-response.schema';

const valid = {
  title: 'Plano de Emagrecimento',
  meals: [
    {
      name: 'Café da Manhã',
      timeLabel: '08:00',
      items: [{ foodName: 'Ovos', quantity: '2 unidades', calories: 140, protein: 12, carbs: 1, fats: 9 }],
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
        meals: [{ name: 'Café da Manhã', timeLabel: null, items: [] }],
      }).success,
    ).toBe(false);
  });

  it('rejects a missing foodName', () => {
    expect(
      mealPlanResponseSchema.safeParse({
        title: 'x',
        meals: [{ name: 'B', timeLabel: null, items: [{ quantity: '2', calories: 100, protein: 5, carbs: 10, fats: 2 }] }],
      }).success,
    ).toBe(false);
  });

  it('rejects an item missing a macro field (e.g. calories)', () => {
    expect(
      mealPlanResponseSchema.safeParse({
        title: 'x',
        meals: [
          {
            name: 'Almoço',
            timeLabel: null,
            items: [{ foodName: 'Frango', quantity: '150g', protein: 30, carbs: 0, fats: 4 }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
