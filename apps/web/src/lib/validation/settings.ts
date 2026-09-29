import { z } from 'zod';
import { canonicalizeWhatsappNumber } from '@nutri-plus/shared-types';

// Campo vazio vai como '' (e não undefined): undefined sai do PATCH e a API
// manteria o valor antigo, sem jeito de apagar. A API grava '' como null.
const optText = (max: number) => z.string().max(max, `Máximo de ${max} caracteres.`).optional();

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
