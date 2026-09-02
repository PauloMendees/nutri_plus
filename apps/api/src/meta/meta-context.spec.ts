import { metaContextFromRequest, serverOnlyMetaContext } from './meta-context';

describe('metaContextFromRequest', () => {
  it('lê o contexto de deduplicação dos headers', () => {
    const ctx = metaContextFromRequest({
      headers: {
        'x-meta-event-id': 'evt-1',
        'x-meta-fbp': 'fb.1.1700000000.111',
        'x-meta-fbc': 'fb.1.1700000000.abc',
        'x-meta-source-url': 'https://inutri.life/assinatura',
        'user-agent': 'Mozilla/5.0',
      },
      ip: '203.0.113.9',
    });

    expect(ctx).toEqual({
      eventId: 'evt-1',
      fbp: 'fb.1.1700000000.111',
      fbc: 'fb.1.1700000000.abc',
      eventSourceUrl: 'https://inutri.life/assinatura',
      clientIpAddress: '203.0.113.9',
      clientUserAgent: 'Mozilla/5.0',
      fromBrowser: true,
    });
  });

  it('gera um event id quando o cliente não mandou — o evento sai só pelo servidor', () => {
    const ctx = metaContextFromRequest({ headers: {}, ip: '203.0.113.9' });
    expect(ctx.eventId).toHaveLength(36);
    expect(ctx.fromBrowser).toBe(false);
  });

  it('trata header vazio como ausente (não manda string vazia para o Meta)', () => {
    const ctx = metaContextFromRequest({ headers: { 'x-meta-fbp': '   ', 'x-meta-event-id': '' } });
    expect(ctx.fbp).toBeUndefined();
    expect(ctx.fromBrowser).toBe(false);
  });

  it('usa o remoteAddress do socket quando req.ip não existe', () => {
    const ctx = metaContextFromRequest({ headers: {}, socket: { remoteAddress: '198.51.100.4' } });
    expect(ctx.clientIpAddress).toBe('198.51.100.4');
  });

  it('aceita header repetido pegando a primeira ocorrência', () => {
    const ctx = metaContextFromRequest({ headers: { 'x-meta-event-id': ['a', 'b'] } });
    expect(ctx.eventId).toBe('a');
  });
});

describe('serverOnlyMetaContext', () => {
  it('marca a origem sem navegador e não inventa cookies', () => {
    const ctx = serverOnlyMetaContext();
    expect(ctx.fromBrowser).toBe(false);
    expect(ctx.fbp).toBeUndefined();
    expect(ctx.fbc).toBeUndefined();
    expect(ctx.eventId).toHaveLength(36);
  });
});
