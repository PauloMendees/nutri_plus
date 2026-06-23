import { z } from 'zod';

export const categoryFormSchema = z.object({
  name: z.string().min(1, 'Informe um nome.').max(100, 'Máximo de 100 caracteres.'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida.')
    .nullable(),
  isDefault: z.boolean(),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
