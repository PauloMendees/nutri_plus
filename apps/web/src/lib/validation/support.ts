import { z } from 'zod';
import { SUPPORT_CATEGORIES } from '@nutri-plus/shared-types';

export const supportRequestSchema = z.object({
  replyTo: z.string().email('Informe um e-mail válido.'),
  category: z.enum(SUPPORT_CATEGORIES, {
    required_error: 'Selecione uma categoria.',
  }),
  description: z
    .string()
    .trim()
    .min(20, 'Descreva o problema com ao menos 20 caracteres.')
    .max(4000, 'Descrição muito longa.'),
});

export type SupportFormValues = z.infer<typeof supportRequestSchema>;
