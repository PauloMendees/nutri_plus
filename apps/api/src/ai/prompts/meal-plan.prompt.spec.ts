import {
  MEAL_PLAN_SYSTEM_PROMPT,
  buildMealPlanUserPrompt,
} from './meal-plan.prompt';

describe('meal-plan prompt', () => {
  it('system prompt instructs the model not to recalculate targets', () => {
    expect(MEAL_PLAN_SYSTEM_PROMPT).toMatch(/not.*recalculate|do not.*calculat/i);
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
});
