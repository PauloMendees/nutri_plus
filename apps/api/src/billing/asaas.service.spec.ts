import { AsaasService } from './asaas.service';

function config(map: Record<string, string>) {
  return { getOrThrow: (k: string) => { if (!map[k]) throw new Error(`missing ${k}`); return map[k]; } } as any;
}
const CFG = { ASAAS_API_URL: 'https://api-sandbox.asaas.com/v3', ASAAS_API_KEY: 'key_123' };

describe('AsaasService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('ensureCustomer faz POST /customers com access_token e retorna id', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true, status: 200, text: async () => JSON.stringify({ id: 'cus_1' }),
    } as any);
    const id = await new AsaasService(config(CFG)).ensureCustomer({ name: 'A', email: 'a@x.com', cpfCnpj: '123' });
    expect(id).toBe('cus_1');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api-sandbox.asaas.com/v3/customers');
    expect((opts as any).headers.access_token).toBe('key_123');
  });

  it('createSubscription cria a assinatura e busca o invoiceUrl do 1º pagamento', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'sub_1' }) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ data: [{ invoiceUrl: 'https://asaas/inv/1' }] }) } as any);
    const out = await new AsaasService(config(CFG)).createSubscription({ customerId: 'cus_1', value: 49, cycle: 'MONTHLY', description: 'Essencial' });
    expect(out).toEqual({ subscriptionId: 'sub_1', invoiceUrl: 'https://asaas/inv/1' });
    expect((fetchMock.mock.calls[0][0] as string)).toBe('https://api-sandbox.asaas.com/v3/subscriptions');
    expect((fetchMock.mock.calls[1][0] as string)).toContain('/subscriptions/sub_1/payments');
  });

  it('lança erro claro quando a API do Asaas responde não-ok', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 400, text: async () => '{"errors":[{"description":"bad"}]}' } as any);
    await expect(new AsaasService(config(CFG)).ensureCustomer({ name: 'A', email: 'a@x.com', cpfCnpj: '1' }))
      .rejects.toThrow();
  });
});
