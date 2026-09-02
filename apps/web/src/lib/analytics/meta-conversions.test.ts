import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiFetch = vi.fn();
const browserApiFetch = vi.fn();

vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock('@/lib/api/browser', () => ({ browserApiFetch: (...a: unknown[]) => browserApiFetch(...a) }));

import {
  trackCompleteRegistration,
  trackConversion,
  trackTrialAtivadoIfReady,
} from './meta-conversions';

beforeEach(() => {
  window.fbq = vi.fn();
  apiFetch.mockReset().mockResolvedValue({ fired: true });
  browserApiFetch.mockReset().mockResolvedValue({ fired: true });
  document.cookie = '_fbp=fb.1.1700000000.123';
});

/** O event_id do fbq e o do header têm de ser o MESMO valor. */
function assertDeduplicated(relay: ReturnType<typeof vi.fn>) {
  const fbqCall = (window.fbq as ReturnType<typeof vi.fn>).mock.calls[0];
  const eventIdFromPixel = (fbqCall[3] as { eventID: string }).eventID;
  const headers = (relay.mock.calls[0][1] as { headers: Record<string, string> }).headers;
  expect(headers['x-meta-event-id']).toBe(eventIdFromPixel);
  return { eventIdFromPixel, headers };
}

describe('trackCompleteRegistration', () => {
  it('dispara o pixel e o relay público com o mesmo event id', async () => {
    trackCompleteRegistration('Ana@Clinica.com ');
    expect(window.fbq).toHaveBeenCalledWith(
      'track',
      'CompleteRegistration',
      { status: true },
      { eventID: expect.any(String) },
    );
    const { headers } = assertDeduplicated(apiFetch);
    // O cadastro ainda não tem sessão: vai pelo relay público, com o e-mail no corpo.
    expect(apiFetch).toHaveBeenCalledWith(
      '/signals',
      expect.objectContaining({
        method: 'POST',
        body: { name: 'CompleteRegistration', email: 'Ana@Clinica.com ' },
      }),
    );
    expect(headers['x-meta-fbp']).toBe('fb.1.1700000000.123');
  });

  it('não propaga falha do relay para o fluxo de cadastro', async () => {
    apiFetch.mockRejectedValue(new Error('rede fora'));
    expect(() => trackCompleteRegistration('ana@x.com')).not.toThrow();
    await Promise.resolve();
    expect(window.fbq).toHaveBeenCalled();
  });
});

describe('trackConversion', () => {
  it('manda plan e period para o relay autenticado recalcular o valor', () => {
    trackConversion('Subscribe', {
      params: { content_name: 'PRO', currency: 'BRL', value: 79 },
      plan: 'PRO',
      period: 'MONTHLY',
    });
    assertDeduplicated(browserApiFetch);
    expect(browserApiFetch).toHaveBeenCalledWith(
      '/me/signals',
      expect.objectContaining({
        method: 'POST',
        body: { name: 'Subscribe', plan: 'PRO', period: 'MONTHLY' },
      }),
    );
  });

  it('StartTrial vai sem plano', () => {
    trackConversion('StartTrial', { params: { value: 0, currency: 'BRL' } });
    expect(browserApiFetch).toHaveBeenCalledWith(
      '/me/signals',
      expect.objectContaining({ body: { name: 'StartTrial', plan: undefined, period: undefined } }),
    );
  });
});

describe('trackTrialAtivadoIfReady', () => {
  it('só dispara o pixel quando o servidor confirma que emitiu', async () => {
    browserApiFetch.mockResolvedValue({ fired: true });
    await trackTrialAtivadoIfReady();
    expect(window.fbq).toHaveBeenCalledWith(
      'trackCustom',
      'TrialAtivado',
      {},
      { eventID: expect.any(String) },
    );
    assertDeduplicated(browserApiFetch);
  });

  it('fica calado quando a condição ainda não foi satisfeita', async () => {
    browserApiFetch.mockResolvedValue({ fired: false });
    await trackTrialAtivadoIfReady();
    expect(window.fbq).not.toHaveBeenCalled();
  });

  it('fica calado quando o servidor já tinha emitido antes (disparo único)', async () => {
    browserApiFetch.mockResolvedValue({ fired: false });
    await trackTrialAtivadoIfReady();
    await trackTrialAtivadoIfReady();
    expect(window.fbq).not.toHaveBeenCalled();
  });

  it('engole erro de rede sem quebrar a criação que a originou', async () => {
    browserApiFetch.mockRejectedValue(new Error('offline'));
    await expect(trackTrialAtivadoIfReady()).resolves.toBeUndefined();
    expect(window.fbq).not.toHaveBeenCalled();
  });
});
