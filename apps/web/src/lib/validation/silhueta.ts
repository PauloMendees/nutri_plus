import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

// Bounds mirror CreateSilhuetaScanDto on the API (waist/hip 0-300; heightCm
// 50-300 e weightKg 2-500 — abaixo disso não é um corpo humano possível).
const optBounded = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(0, 'Não pode ser negativo.').max(max, 'Valor acima do limite.').optional(),
  );

// Altura e peso entram no cálculo da composição estimada — sem eles a
// estimativa perde a referência de escala do corpo. min > 0 fecha o buraco de
// um 0 "obrigatório porém preenchido": passava no required e ainda assim não
// dá para estimar composição de um corpo com altura/peso zero.
const reqBounded = (min: number, max: number, requiredMsg: string) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ required_error: requiredMsg, invalid_type_error: requiredMsg })
      .min(min, 'Valor abaixo do mínimo.')
      .max(max, 'Valor acima do limite.'),
  );

export const silhuetaSchema = z.object({
  scanDate: z.string().optional(),
  heightCm: reqBounded(50, 300, 'Informe a altura.'),
  weightKg: reqBounded(2, 500, 'Informe o peso.'),
  waistInput: optBounded(300),
  hipInput: optBounded(300),
});

export type SilhuetaValues = z.infer<typeof silhuetaSchema>;
