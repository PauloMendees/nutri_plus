import { z } from 'zod';

export const silhuetaResponseSchema = z.object({
  bodyFatPercentage: z.number().nullable(),
  muscleMassPercentage: z.number().nullable(),
  leanMassPercentage: z.number().nullable(),
  waistCircumference: z.number().nullable(),
  hipCircumference: z.number().nullable(),
  chestCircumference: z.number().nullable(),
  armCircumference: z.number().nullable(),
  thighCircumference: z.number().nullable(),
  abdomenCircumference: z.number().nullable(),
  contractedArmCircumference: z.number().nullable(),
  calfCircumference: z.number().nullable(),
});
export type SilhuetaResponse = z.infer<typeof silhuetaResponseSchema>;
