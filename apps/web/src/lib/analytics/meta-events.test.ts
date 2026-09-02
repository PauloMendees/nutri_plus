import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkoutValue,
  metaClientContext,
  metaHeaders,
  newEventId,
  resolveFbc,
  trackMetaCustomEvent,
  trackMetaEvent,
} from './meta-events';

function clearCookies() {
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

beforeEach(() => {
  window.fbq = vi.fn();
  clearCookies();
});

afterEach(() => {
  clearCookies();
  vi.restoreAllMocks();
});

describe('trackMetaEvent', () => {
  it('anexa o eventID para o Meta poder deduplicar com a CAPI', () => {
    trackMetaEvent('CompleteRegistration', { status: true }, 'evt-1');
    expect(window.fbq).toHaveBeenCalledWith(
      'track',
      'CompleteRegistration',
      { status: true },
      { eventID: 'evt-1' },
    );
  });

  it('omite o quarto argumento quando não há event id', () => {
    trackMetaEvent('StartTrial');
    expect(window.fbq).toHaveBeenCalledWith('track', 'StartTrial', {}, undefined);
  });

  it('não quebra quando o pixel não carregou', () => {
    delete window.fbq;
    expect(() => trackMetaEvent('StartTrial')).not.toThrow();
  });
});

describe('trackMetaCustomEvent', () => {
  it('usa trackCustom com o mesmo eventID', () => {
    trackMetaCustomEvent('TrialAtivado', {}, 'evt-2');
    expect(window.fbq).toHaveBeenCalledWith('trackCustom', 'TrialAtivado', {}, { eventID: 'evt-2' });
  });
});

describe('newEventId', () => {
  it('gera ids distintos', () => {
    expect(newEventId()).not.toBe(newEventId());
  });

  it('cai no fallback quando crypto.randomUUID não existe', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('indisponível');
    });
    // O guard checa o tipo antes de chamar; força o caminho removendo a função.
    const original = crypto.randomUUID;
    // @ts-expect-error simulando navegador antigo / contexto inseguro
    crypto.randomUUID = undefined;
    try {
      expect(newEventId()).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    } finally {
      crypto.randomUUID = original;
    }
  });
});

describe('metaClientContext', () => {
  it('lê _fbp e _fbc dos cookies e a URL da página', () => {
    document.cookie = '_fbp=fb.1.1700000000.123';
    document.cookie = '_fbc=fb.1.1700000000.abc';
    const ctx = metaClientContext('evt-3');
    expect(ctx).toMatchObject({
      eventId: 'evt-3',
      fbp: 'fb.1.1700000000.123',
      fbc: 'fb.1.1700000000.abc',
      eventSourceUrl: window.location.href,
    });
  });

  it('omite os cookies ausentes em vez de mandar string vazia', () => {
    const ctx = metaClientContext('evt-4');
    expect(ctx.fbp).toBeUndefined();
    expect(ctx.fbc).toBeUndefined();
  });
});

describe('resolveFbc', () => {
  it('deriva o _fbc do fbclid quando o cookie ainda não foi gravado', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('fbclid', 'IwAR123');
    window.history.replaceState({}, '', url);
    expect(resolveFbc()).toMatch(/^fb\.1\.\d+\.IwAR123$/);
    url.searchParams.delete('fbclid');
    window.history.replaceState({}, '', url);
  });

  it('prefere o cookie quando ele existe', () => {
    document.cookie = '_fbc=fb.1.999.cookie';
    expect(resolveFbc()).toBe('fb.1.999.cookie');
  });
});

describe('metaHeaders', () => {
  it('mapeia o contexto para os headers que o backend lê', () => {
    expect(
      metaHeaders({ eventId: 'e', fbp: 'p', fbc: 'c', eventSourceUrl: 'https://x/y' }),
    ).toEqual({
      'x-meta-event-id': 'e',
      'x-meta-fbp': 'p',
      'x-meta-fbc': 'c',
      'x-meta-source-url': 'https://x/y',
    });
  });

  it('só o event id é obrigatório', () => {
    expect(metaHeaders({ eventId: 'e' })).toEqual({ 'x-meta-event-id': 'e' });
  });
});

describe('checkoutValue', () => {
  it('returns the catalog price for plan and period', () => {
    expect(checkoutValue('ESSENCIAL', 'MONTHLY')).toBe(39);
    expect(checkoutValue('PRO', 'YEARLY')).toBe(790);
  });
});
