import { z } from 'zod';
import { parseBRLToCents } from '@/lib/format/currency';

export const transactionFormSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  // amount is entered as a pt-BR string; must parse to a positive value.
  amount: z
    .string()
    .trim()
    .min(1, 'Informe um valor.')
    .refine((v) => parseBRLToCents(v) > 0, 'Valor inválido.'),
  occurredOn: z.string().min(1, 'Informe a data.'), // 'YYYY-MM-DD' from <input type="date">
  categoryId: z.string().nullable().optional(),
  description: z.string().max(500).optional(),
});

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;
