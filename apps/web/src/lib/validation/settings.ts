import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const optText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().max(max, `Máximo de ${max} caracteres.`).optional());

export const settingsSchema = z.object({
  displayName: optText(120),
  mealPlanAiInstructions: optText(4000),
  defaultCanLogAssessments: z.boolean(),
  defaultShowMealTargetToPatient: z.boolean(),
});

export type SettingsValues = z.infer<typeof settingsSchema>;
