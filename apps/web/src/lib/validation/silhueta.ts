import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

// Bounds mirror CreateSilhuetaScanDto on the API (heightCm/waist/hip 0-300, weightKg 0-500).
const optBounded = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(0, 'Não pode ser negativo.').max(max, 'Valor acima do limite.').optional(),
  );

// Altura e peso entram no cálculo da composição estimada — sem eles a
// estimativa perde a referência de escala do corpo.
const reqBounded = (max: number, requiredMsg: string) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ required_error: requiredMsg, invalid_type_error: requiredMsg })
      .min(0, 'Não pode ser negativo.')
      .max(max, 'Valor acima do limite.'),
  );

export const silhuetaSchema = z.object({
  scanDate: z.string().optional(),
  heightCm: reqBounded(300, 'Informe a altura.'),
  weightKg: reqBounded(500, 'Informe o peso.'),
  waistInput: optBounded(300),
  hipInput: optBounded(300),
});

export type SilhuetaValues = z.infer<typeof silhuetaSchema>;
