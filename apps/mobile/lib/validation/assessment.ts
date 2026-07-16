import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const optBounded = (max: number, msg = 'Valor acima do limite.') =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(0, 'Não pode ser negativo.').max(max, msg).optional(),
  );
const optPositiveBounded = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive('Deve ser maior que zero.').max(max, 'Valor acima do limite.').optional(),
  );
const optIntBounded = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int('Deve ser um número inteiro.').min(0, 'Não pode ser negativo.').max(max, 'Valor acima do limite.').optional(),
  );
const percent = optBounded(100, 'Não pode passar de 100.');

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
    weight: optPositiveBounded(500),
    bodyFatPercentage: percent,
    muscleMassPercentage: percent,
    leanMassPercentage: percent,
    visceralFat: optBounded(60),
    basalMetabolicRate: optPositiveBounded(10000),
    bodyWaterPercentage: percent,
    boneMass: optBounded(20),
    metabolicAge: optIntBounded(120),
    waistCircumference: optBounded(300),
    hipCircumference: optBounded(300),
    chestCircumference: optBounded(300),
    armCircumference: optBounded(300),
    thighCircumference: optBounded(300),
    abdomenCircumference: optBounded(300),
    contractedArmCircumference: optBounded(300),
    calfCircumference: optBounded(300),
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
