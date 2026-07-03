import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
});

export const resetPasswordSchema = z
  .object({
    code: z.string().regex(/^\d{8}$/, 'Informe o código de 8 dígitos.'),
    password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
