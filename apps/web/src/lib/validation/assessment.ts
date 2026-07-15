import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const optNonNegative = z.preprocess(
  emptyToUndefined,
  z.coerce.number().min(0, 'Não pode ser negativo.').optional(),
);
const optPositive = z.preprocess(
  emptyToUndefined,
  z.coerce.number().positive('Deve ser maior que zero.').optional(),
);
const optInt = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int('Deve ser um número inteiro.').min(0, 'Não pode ser negativo.').optional(),
);

// The 18 measurable fields; date/notes alone do not count as "a metric".
const NUMERIC_KEYS = [
  'weight',
  'bodyFatPercentage',
  'muscleMassPercentage',
  'leanMassPercentage',
  'visceralFat',
  'basalMetabolicRate',
  'bodyWaterPercentage',
  'boneMass',
  'metabolicAge',
  'waistCircumference',
  'hipCircumference',
  'chestCircumference',
  'armCircumference',
  'thighCircumference',
  'abdomenCircumference',
  'contractedArmCircumference',
  'calfCircumference',
] as const;

export const assessmentSchema = z
  .object({
    assessmentDate: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .refine(
          (v) => v.slice(0, 10) <= new Date().toISOString().slice(0, 10),
          'A data não pode ser futura.',
        )
        .optional(),
    ),
    weight: optPositive,
    bodyFatPercentage: optNonNegative,
    muscleMassPercentage: optNonNegative,
    leanMassPercentage: optNonNegative,
    visceralFat: optNonNegative,
    basalMetabolicRate: optPositive,
    bodyWaterPercentage: optNonNegative,
    boneMass: optNonNegative,
    metabolicAge: optInt,
    waistCircumference: optNonNegative,
    hipCircumference: optNonNegative,
    chestCircumference: optNonNegative,
    armCircumference: optNonNegative,
    thighCircumference: optNonNegative,
    abdomenCircumference: optNonNegative,
    contractedArmCircumference: optNonNegative,
    calfCircumference: optNonNegative,
    notes: z.preprocess(
      emptyToUndefined,
      z.string().max(2000, 'Máximo de 2000 caracteres.').optional(),
    ),
  })
  .refine((v) => NUMERIC_KEYS.some((k) => v[k] != null), {
    message: 'Informe ao menos uma métrica.',
    path: ['weight'],
  });

export type AssessmentValues = z.infer<typeof assessmentSchema>;
