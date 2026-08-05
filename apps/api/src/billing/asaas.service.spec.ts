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

  it('lança erro claro quando a API do Asaas responde não-ok', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 400, text: async () => '{"errors":[{"description":"bad"}]}' } as any);
    await expect(new AsaasService(config(CFG)).ensureCustomer({ name: 'A', email: 'a@x.com', cpfCnpj: '1' }))
      .rejects.toThrow();
  });

  it('createPixSubscription cria assinatura PIX e busca o QR do 1º pagamento', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'sub_1' }) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'pay_1' }] }) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ encodedImage: 'BASE64', payload: '00020126...' }) } as any);
    const out = await new AsaasService(config(CFG)).createPixSubscription({ customerId: 'cus_1', value: 49, cycle: 'MONTHLY', description: 'x' });
    expect(out).toEqual({ subscriptionId: 'sub_1', pixQrCode: { encodedImage: 'BASE64', payload: '00020126...' } });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api-sandbox.asaas.com/v3/subscriptions');
    expect((fetchMock.mock.calls[0][1] as any).body).toContain('"billingType":"PIX"');
    expect(fetchMock.mock.calls[2][0]).toBe('https://api-sandbox.asaas.com/v3/payments/pay_1/pixQrCode');
  });

  it('createCardSubscription envia creditCard/holderInfo/remoteIp e mapeia CONFIRMED → ACTIVE + last4/brand', async () => {
    jest.spyOn(global, 'fetch' as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'sub_2', creditCard: { creditCardNumber: '1234', creditCardBrand: 'MASTERCARD' } }) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ data: [{ status: 'CONFIRMED' }] }) } as any);
    const out = await new AsaasService(config(CFG)).createCardSubscription({
      customerId: 'cus_1', value: 99, cycle: 'MONTHLY', description: 'x',
      card: { holderName: 'A B', number: '5162306219378829', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
      holderInfo: { postalCode: '01310000', addressNumber: '100', phone: '11999999999' },
      holder: { name: 'A B', email: 'a@x.com', cpfCnpj: '12345678901' }, remoteIp: '1.2.3.4',
    });
    expect(out).toEqual({ subscriptionId: 'sub_2', status: 'ACTIVE', cardLast4: '1234', cardBrand: 'MASTERCARD' });
  });

  it('createCardSubscription mapeia recusa do Asaas (400) para 422 sem vazar detalhe cru', async () => {
    const RAW_ASAAS_TEXT = '{"errors":[{"description":"Transação não autorizada"}]}';
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 400, text: async () => RAW_ASAAS_TEXT } as any);
    let caught: any;
    try {
      await new AsaasService(config(CFG)).createCardSubscription({
        customerId: 'cus_1', value: 99, cycle: 'MONTHLY', description: 'x',
        card: { holderName: 'A B', number: '4', expiryMonth: '12', expiryYear: '2030', ccv: '1' },
        holderInfo: { postalCode: '0', addressNumber: '1', phone: '1' },
        holder: { name: 'A B', email: 'a@x.com', cpfCnpj: '12345678901' }, remoteIp: '1.2.3.4',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toMatchObject({ status: 422 });
    // Insurance PCI: a mensagem exposta ao cliente deve ser o texto limpo e
    // fixo, nunca o corpo cru retornado pelo Asaas (que pode conter dados
    // sensíveis do cartão/transação).
    expect(caught.message).toBe('Cartão recusado. Confira os dados ou tente outro cartão.');
    expect(caught.message).not.toContain('Transação não autorizada');
    const responseBody = JSON.stringify(caught.getResponse?.() ?? caught);
    expect(responseBody).not.toContain('Transação não autorizada');
    expect(responseBody).not.toContain(RAW_ASAAS_TEXT);
  });
});
