import { buildMealPlanDocDefinition, PdfMealPlan } from './meal-plan-doc';

function plan(overrides: Partial<PdfMealPlan> = {}): PdfMealPlan {
  return {
    title: 'Plano A',
    objective: 'Hipertrofia',
    createdAt: new Date('2026-06-27T00:00:00Z'),
    targetCalories: 1800,
    targetProtein: 135,
    targetCarbs: 180,
    targetFats: 60,
    meals: [
      {
        name: 'Café',
        timeLabel: '08:00',
        instructions: 'Mastigar bem',
        options: [
          { label: 'Opção 1', items: [{ foodName: 'Ovos', quantity: '3 unid', calories: 230, protein: 18, carbs: 2, fats: 16 }] },
          { label: 'Opção 2', items: [{ foodName: 'Tapioca', quantity: '2 colheres', calories: 150, protein: 11, carbs: 20, fats: 3 }] },
        ],
      },
    ],
    ...overrides,
  };
}

describe('buildMealPlanDocDefinition', () => {
  it('includes the brand name, title, meal, options, items and targets', () => {
    const doc = buildMealPlanDocDefinition(plan(), { displayName: 'Dra. Daniela', logoDataUrl: null });
    const json = JSON.stringify(doc);
    expect(json).toContain('Dra. Daniela');
    expect(json).toContain('Plano A');
    expect(json).toContain('Café');
    expect(json).toContain('Opção 1');
    expect(json).toContain('Opção 2');
    expect(json).toContain('Ovos');
    expect(json).toContain('Tapioca');
    expect(json).toContain('Proteína'); // targets header present
    expect(json).toContain('135');      // a target value
  });

  it('includes an image node when a logo data URL is provided, and omits it otherwise', () => {
    const withLogo = buildMealPlanDocDefinition(plan(), { displayName: null, logoDataUrl: 'data:image/png;base64,AAAA' });
    expect(JSON.stringify(withLogo)).toContain('"image"');
    const noLogo = buildMealPlanDocDefinition(plan(), { displayName: null, logoDataUrl: null });
    expect(JSON.stringify(noLogo)).not.toContain('"image"');
  });

  it('omits the targets row when all targets are null', () => {
    const doc = buildMealPlanDocDefinition(
      plan({ targetCalories: null, targetProtein: null, targetCarbs: null, targetFats: null }),
      { displayName: null, logoDataUrl: null },
    );
    expect(JSON.stringify(doc)).not.toContain('Proteína');
  });

  it('tolerates a meal with no options and an option with no items', () => {
    const doc = buildMealPlanDocDefinition(
      plan({ meals: [
        { name: 'Vazia', timeLabel: null, instructions: null, options: [] },
        { name: 'Sem itens', timeLabel: null, instructions: null, options: [{ label: 'Opção 1', items: [] }] },
      ] }),
      { displayName: null, logoDataUrl: null },
    );
    expect(JSON.stringify(doc)).toContain('Vazia');
    expect(JSON.stringify(doc)).toContain('Sem itens');
  });
});
