import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { ResendService } from './resend.service';

describe('ResendService', () => {
  const input = {
    to: 'inbox@inutri.life',
    from: 'iNutri <suporte@inutri.life>',
    replyTo: 'user@x.com',
    subject: 'subj',
    text: 'body',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POST /emails com Authorization Bearer e payload correto', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'email_1' }),
    } as Response);

    const svc = new ResendService({ get: () => 're_test_key' } as any);
    await svc.sendSupportEmail(input);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_key',
        }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      from: input.from,
      to: [input.to],
      reply_to: input.replyTo,
      subject: input.subject,
      text: input.text,
    });
  });

  it('503 quando RESEND_API_KEY ausente', async () => {
    const svc = new ResendService({ get: () => undefined } as any);
    await expect(svc.sendSupportEmail(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('502 quando Resend responde erro', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => '{"message":"invalid"}',
    } as Response);
    const svc = new ResendService({ get: () => 're_key' } as any);
    await expect(svc.sendSupportEmail(input)).rejects.toBeInstanceOf(BadGatewayException);
  });
});
