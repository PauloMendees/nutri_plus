import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { rateLimitMessageFrom } from './rate-limit-errors';

describe('rateLimitMessageFrom', () => {
  it('RATE_LIMITED vira a mensagem de aguardar', () => {
    const err = new ApiError(429, { statusCode: 429, code: 'RATE_LIMITED' });
    expect(rateLimitMessageFrom(err)).toBe('Muitas solicitações. Aguarde um minuto e tente de novo.');
  });

  it('AI_DAILY_CAP_EXCEEDED vira a mensagem de limite diário', () => {
    const err = new ApiError(429, { code: 'AI_DAILY_CAP_EXCEEDED', scope: 'nutritionist' });
    expect(rateLimitMessageFrom(err)).toBe('Limite diário de IA atingido. Tente amanhã.');
  });

  it('429 sem code conhecido cai na mensagem de aguardar', () => {
    expect(rateLimitMessageFrom(new ApiError(429, null))).toBe('Muitas solicitações. Aguarde um minuto e tente de novo.');
  });

  it('ignora não-429 e não-ApiError', () => {
    expect(rateLimitMessageFrom(new ApiError(402, { code: 'READ_ONLY' }))).toBeNull();
    expect(rateLimitMessageFrom(new Error('x'))).toBeNull();
  });
});
