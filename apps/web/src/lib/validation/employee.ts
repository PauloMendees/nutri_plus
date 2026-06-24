import { z } from 'zod';

export const inviteEmployeeSchema = z.object({
  name: z.string().min(2, 'Informe o nome do funcionário.').max(200),
  email: z.string().email('Informe um e-mail válido.').max(320),
});

export const updateEmployeeSchema = z.object({
  name: z.string().min(2, 'Informe o nome do funcionário.').max(200),
});

export type InviteEmployeeValues = z.infer<typeof inviteEmployeeSchema>;
export type UpdateEmployeeValues = z.infer<typeof updateEmployeeSchema>;
