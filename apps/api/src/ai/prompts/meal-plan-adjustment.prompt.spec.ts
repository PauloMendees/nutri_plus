import { MEAL_PLAN_ADJUSTMENT_SYSTEM_PROMPT } from './meal-plan-adjustment.prompt';

describe('meal-plan adjustment prompt', () => {
  it('mantém as metas do dia', () => {
    expect(MEAL_PLAN_ADJUSTMENT_SYSTEM_PROMPT).toMatch(/do NOT\s+recalculate or change them/);
  });

  it('pede horário em HH:MM (24h)', () => {
    expect(MEAL_PLAN_ADJUSTMENT_SYSTEM_PROMPT).toMatch(/timeLabel[^.]*HH:MM/);
  });
});
