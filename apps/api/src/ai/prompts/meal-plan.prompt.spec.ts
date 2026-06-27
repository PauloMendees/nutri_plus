import {
  MEAL_PLAN_SYSTEM_PROMPT,
  buildMealPlanUserPrompt,
} from './meal-plan.prompt';

describe('meal-plan prompt', () => {
  it('system prompt instructs the model not to recalculate targets', () => {
    expect(MEAL_PLAN_SYSTEM_PROMPT).toMatch(/not.*recalculate|do not.*calculat/i);
  });

  it('system prompt instructs per-item macro estimation', () => {
    expect(MEAL_PLAN_SYSTEM_PROMPT).toMatch(/estimate.*macro|macro.*estim/i);
  });

  it('system prompt instructs Brazilian Portuguese output', () => {
    expect(MEAL_PLAN_SYSTEM_PROMPT).toMatch(/Brazilian Portuguese|pt-BR/i);
  });

  it('user prompt is valid JSON carrying the targets and context', () => {
    const json = buildMealPlanUserPrompt({
      age: 30,
      weightKg: 80,
      heightCm: 180,
      gender: 'MALE',
      objective: 'WEIGHT_LOSS',
      activityLevel: 'MODERATE',
      restrictions: 'lactose',
      allergies: null,
      targets: { calories: 2207, protein: 160, carbs: 255, fats: 61 },
    });
    const parsed = JSON.parse(json);
    expect(parsed.targets.calories).toBe(2207);
    expect(parsed.weightKg).toBe(80);
    expect(parsed.restrictions).toBe('lactose');
  });

  it('system prompt tells the model to follow extra instructions but never override safety/targets', () => {
    expect(MEAL_PLAN_SYSTEM_PROMPT).toMatch(/instructions/i);
    expect(MEAL_PLAN_SYSTEM_PROMPT).toMatch(/never.*(override|violate)|do not.*override/i);
  });

  it('user prompt carries default and custom instructions when given', () => {
    const json = buildMealPlanUserPrompt({
      age: 30, weightKg: 80, heightCm: 180, gender: 'MALE', objective: 'WEIGHT_LOSS',
      activityLevel: 'MODERATE', restrictions: null, allergies: null,
      targets: { calories: 2000, protein: 150, carbs: 200, fats: 60 },
      defaultInstructions: 'Priorizar alimentos acessíveis',
      customInstructions: 'Apenas 4 refeições',
    });
    const parsed = JSON.parse(json);
    expect(parsed.defaultInstructions).toBe('Priorizar alimentos acessíveis');
    expect(parsed.customInstructions).toBe('Apenas 4 refeições');
  });

  it('system prompt instructs exactly two macro-comparable options per meal', () => {
    expect(MEAL_PLAN_SYSTEM_PROMPT).toMatch(/exactly two/i);
    expect(MEAL_PLAN_SYSTEM_PROMPT).toMatch(/option/i);
  });
});
