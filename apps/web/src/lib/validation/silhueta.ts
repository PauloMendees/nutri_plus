import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

// Bounds mirror CreateSilhuetaScanDto on the API (heightCm/waist/hip 0-300, weightKg 0-500).
const optBounded = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(0, 'Não pode ser negativo.').max(max, 'Valor acima do limite.').optional(),
  );

export const silhuetaSchema = z.object({
  scanDate: z.string().optional(),
  heightCm: optBounded(300),
  weightKg: optBounded(500),
  waistInput: optBounded(300),
  hipInput: optBounded(300),
});

export type SilhuetaValues = z.infer<typeof silhuetaSchema>;
