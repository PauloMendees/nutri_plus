import { ConfigService } from '@nestjs/config';
import { MetaCapiService, hashEmail } from './meta-capi.service';
import { serverOnlyMetaContext, type MetaContext } from './meta-context';

function config(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const BROWSER_CTX: MetaContext = {
  eventId: 'evt-123',
  fbp: 'fb.1.1700000000.111',
  fbc: 'fb.1.1700000000.abc',
  eventSourceUrl: 'https://inutri.life/signup',
  clientIpAddress: '203.0.113.9',
  clientUserAgent: 'Mozilla/5.0',
  fromBrowser: true,
};

const FULL_CONFIG = {
  META_PIXEL_ID: '1633275874982739',
  META_CAPI_ACCESS_TOKEN: 'EAA-token',
};

function okFetch() {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue({ ok: true, status: 200, text: async () => '{}' } as Response);
}

function sentBody(fetchMock: jest.SpyInstance) {
  return JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
}

afterEach(() => jest.restoreAllMocks());

describe('hashEmail', () => {
  it('normaliza (minúsculo, sem espaços nas pontas) antes do SHA-256', () => {
    expect(hashEmail('  Ana@Clinica.COM ')).toBe(hashEmail('ana@clinica.com'));
    // Valor fixo: se a normalização mudar, o match de e-mail no Meta quebra em silêncio.
    expect(hashEmail('ana@clinica.com')).toBe(
      'd3776cbfd33137795541cbfeb8247b032376634047b4cb8bc0dd92a07c4d817d',
    );
  });
});

describe('MetaCapiService', () => {
  it('POSTa no endpoint de eventos do pixel configurado', async () => {
    const fetchMock = okFetch();
    await new MetaCapiService(config(FULL_CONFIG)).send({
      name: 'StartTrial',
      context: BROWSER_CTX,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/1633275874982739/events',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('respeita META_CAPI_API_VERSION quando informado', async () => {
    const fetchMock = okFetch();
    await new MetaCapiService(
      config({ ...FULL_CONFIG, META_CAPI_API_VERSION: 'v23.0' }),
    ).send({ name: 'StartTrial', context: BROWSER_CTX });
    expect(fetchMock.mock.calls[0][0]).toContain('/v23.0/');
  });

  it('monta o evento com event_id, action_source e user_data completos', async () => {
    const fetchMock = okFetch();
    await new MetaCapiService(config(FULL_CONFIG)).send({
      name: 'CompleteRegistration',
      context: BROWSER_CTX,
      email: 'Ana@Clinica.com',
      customData: { status: true },
    });

    const body = sentBody(fetchMock);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      event_name: 'CompleteRegistration',
      // Mesmo id do fbq: é isto que faz o Meta deduplicar em vez de contar duas vezes.
      event_id: 'evt-123',
      action_source: 'website',
      event_source_url: 'https://inutri.life/signup',
      custom_data: { status: true },
      user_data: {
        em: [hashEmail('ana@clinica.com')],
        fbp: 'fb.1.1700000000.111',
        fbc: 'fb.1.1700000000.abc',
        client_ip_address: '203.0.113.9',
        client_user_agent: 'Mozilla/5.0',
      },
    });
    expect(typeof body.data[0].event_time).toBe('number');
  });

  it('nunca manda e-mail em claro', async () => {
    const fetchMock = okFetch();
    await new MetaCapiService(config(FULL_CONFIG)).send({
      name: 'Subscribe',
      context: BROWSER_CTX,
      email: 'ana@clinica.com',
    });
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).not.toContain('ana@clinica.com');
  });

  it('manda o access_token no corpo, não na query string', async () => {
    const fetchMock = okFetch();
    await new MetaCapiService(config(FULL_CONFIG)).send({
      name: 'Subscribe',
      context: BROWSER_CTX,
    });
    expect(fetchMock.mock.calls[0][0]).not.toContain('access_token');
    expect(sentBody(fetchMock).access_token).toBe('EAA-token');
  });

  it('inclui test_event_code só quando a env está preenchida', async () => {
    const withCode = okFetch();
    await new MetaCapiService(
      config({ ...FULL_CONFIG, META_CAPI_TEST_EVENT_CODE: 'TEST123' }),
    ).send({ name: 'StartTrial', context: BROWSER_CTX });
    expect(sentBody(withCode).test_event_code).toBe('TEST123');

    jest.restoreAllMocks();
    const withoutCode = okFetch();
    await new MetaCapiService(config(FULL_CONFIG)).send({
      name: 'StartTrial',
      context: BROWSER_CTX,
    });
    expect(sentBody(withoutCode)).not.toHaveProperty('test_event_code');
  });

  it('omite campos ausentes do user_data em vez de mandar vazio', async () => {
    const fetchMock = okFetch();
    await new MetaCapiService(config(FULL_CONFIG)).send({
      name: 'TrialAtivado',
      context: serverOnlyMetaContext(),
    });
    expect(sentBody(fetchMock).data[0].user_data).toEqual({});
    expect(sentBody(fetchMock).data[0]).not.toHaveProperty('event_source_url');
  });

  it('vira no-op silencioso sem pixel ou sem token', async () => {
    const fetchMock = okFetch();
    const svc = new MetaCapiService(config({ META_PIXEL_ID: '123' }));
    expect(svc.isEnabled()).toBe(false);
    await svc.send({ name: 'StartTrial', context: BROWSER_CTX });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enqueue engole a falha: o Meta fora do ar não pode derrubar o fluxo', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('graph indisponível'));
    const svc = new MetaCapiService(config(FULL_CONFIG));
    expect(() => svc.enqueue({ name: 'Subscribe', context: BROWSER_CTX })).not.toThrow();
    // Deixa o rejeitado ser tratado pelo .catch interno antes do fim do teste.
    await new Promise((r) => setImmediate(r));
  });

  it('send propaga o erro HTTP para quem quiser observar (enqueue é quem engole)', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 400, text: async () => 'bad token' } as Response);
    await expect(
      new MetaCapiService(config(FULL_CONFIG)).send({ name: 'Subscribe', context: BROWSER_CTX }),
    ).rejects.toThrow(/graph 400/);
  });
});
