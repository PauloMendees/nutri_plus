import { mealPlanResponseSchema } from './meal-plan-response.schema';

const valid = {
  title: 'Plano de Emagrecimento',
  meals: [
    {
      name: 'Café da Manhã',
      timeLabel: '08:00',
      options: [
        { label: 'Opção 1', items: [{ foodName: 'Ovos', quantity: '2 unidades', calories: 140, protein: 12, carbs: 1, fats: 9 }] },
        { label: 'Opção 2', items: [{ foodName: 'Tapioca', quantity: '2 colheres', calories: 150, protein: 11, carbs: 20, fats: 3 }] },
      ],
    },
  ],
};

describe('mealPlanResponseSchema', () => {
  it('accepts a well-formed plan with options', () => {
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
    expect(mealPlanResponseSchema.safeParse({ title: 'x', meals: [] }).success).toBe(false);
  });

  it('rejects a meal with no options', () => {
    expect(
      mealPlanResponseSchema.safeParse({
        title: 'x',
        meals: [{ name: 'Café', timeLabel: null, options: [] }],
      }).success,
    ).toBe(false);
  });

  it('rejects an option with no items', () => {
    expect(
      mealPlanResponseSchema.safeParse({
        title: 'x',
        meals: [{ name: 'Café', timeLabel: null, options: [{ label: 'Opção 1', items: [] }] }],
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
            options: [{ label: 'Opção 1', items: [{ foodName: 'Frango', quantity: '150g', protein: 30, carbs: 0, fats: 4 }] }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
