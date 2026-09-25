import { z } from 'zod';
import { tryCanonicalizeWhatsappNumber } from '@nutri-plus/shared-types';

export const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});

export const signupSchema = z
  .object({
    name: z.string().min(2, 'Informe seu nome.'),
    email: z.string().email('Informe um e-mail válido.'),
    countryCode: z.string().regex(/^\+\d{1,3}$/, 'DDI inválido.'),
    whatsapp: z.string().trim().min(1, 'Informe seu WhatsApp.'),
    password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  })
  .refine((v) => tryCanonicalizeWhatsappNumber(signupWhatsapp(v)) !== null, {
    message: 'Número de WhatsApp inválido.',
    path: ['whatsapp'],
  });

// Número completo enviado nos metadados do cadastro, ex.: "+55 (11) 99999-8888".
export function signupWhatsapp(v: Pick<SignupValues, 'countryCode' | 'whatsapp'>): string {
  return `${v.countryCode} ${v.whatsapp}`;
}

export const forgotPasswordSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
