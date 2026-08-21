import { z } from 'zod';
import { canonicalizeWhatsappNumber } from '@nutri-plus/shared-types';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const optText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().max(max, `Máximo de ${max} caracteres.`).optional());

export const settingsSchema = z.object({
  displayName: optText(120),
  mealPlanAiInstructions: optText(4000),
  defaultCanLogAssessments: z.boolean(),
  defaultShowMealTargetToPatient: z.boolean(),
  whatsappNumber: z.string().refine((v) => {
    try {
      canonicalizeWhatsappNumber(v);
      return true;
    } catch {
      return false;
    }
  }, 'Número de WhatsApp inválido.'),
});

export type SettingsValues = z.infer<typeof settingsSchema>;
