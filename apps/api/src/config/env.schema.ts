import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Must be an absolute http(s) origin — `z.string().url()` alone accepts
  // schemeless values like 'localhost:3001' (parsed as scheme 'localhost:'),
  // which would yield a broken invite redirectTo.
  WEB_ORIGIN: z.string().url().regex(/^https?:\/\//, 'must be an http(s) URL'),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL_SMART: z.string().min(1).default('gpt-5-mini'),
  OPENAI_MODEL_FAST: z.string().min(1).default('gpt-4o-mini'),
  // whisper-1 e não gpt-4o-mini-transcribe: a família gpt-4o-transcribe tem teto
  // de 2000 tokens de saída, que trunca a transcrição por volta dos 10 minutos
  // de fala — inviável para consulta. Ver docs/models/gpt-4o-mini-transcribe.
  OPENAI_MODEL_TRANSCRIBE: z.string().min(1).default('whisper-1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  REMINDER_DISPATCH_KEY: z.string().min(1).optional(),
  ASAAS_API_KEY: z.string().min(1).optional(),
  ASAAS_API_URL: z.string().url().optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().min(1).optional(),
  // Resend (pedidos de suporte do dashboard). Opcionais no boot; se
  // ausentes no envio, o endpoint devolve 503 com mensagem clara.
  RESEND_API_KEY: z.string().min(1).optional(),
  SUPPORT_INBOX_EMAIL: z.string().email().optional(),
  SUPPORT_FROM_EMAIL: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}
