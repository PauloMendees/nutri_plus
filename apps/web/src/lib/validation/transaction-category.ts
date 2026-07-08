import { z } from 'zod';

export const transactionCategoryFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe um nome.').max(80),
  type: z.enum(['INCOME', 'EXPENSE']),
});

export type TransactionCategoryFormValues = z.infer<typeof transactionCategoryFormSchema>;
