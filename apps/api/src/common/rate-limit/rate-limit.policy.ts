// Limites por minuto. A chave do contador é `user:<sub>` em rota autenticada e
// `ip:<req.ip>` em rota pública (ver ApiThrottlerGuard). Um só lugar para
// ajustar: a spec 2026-09-14-abuse-hardening-design.md traz os números.
export const RATE_LIMIT_WINDOW_MS = 60_000;

export const RATE_LIMITS = {
  global: 120,
  publicSignals: 5,
  syncUser: 20,
  aiJob: 10, // gerar/ajustar plano e retry
  silhueta: 5,
  audio: 5, // upload e transcrição
  importPreview: 10,
  outsideHome: 5,
} as const;

// Forma que o decorator @Throttle espera; 'default' é o nome do throttler
// registrado em AppModule.
export function perMinute(limit: number) {
  return { default: { limit, ttl: RATE_LIMIT_WINDOW_MS } };
}
