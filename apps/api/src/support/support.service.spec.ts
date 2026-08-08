import { ServiceUnavailableException } from '@nestjs/common';
import { SupportService } from './support.service';

function make(
  env: Record<string, string | undefined> = {
    SUPPORT_INBOX_EMAIL: 'inbox@inutri.life',
    SUPPORT_FROM_EMAIL: 'iNutri Suporte <suporte@inutri.life>',
  },
) {
  const resend = { sendSupportEmail: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (k: string) => env[k] };
  return {
    resend,
    svc: new SupportService(resend as any, config as any),
  };
}

const ticket = {
  replyTo: 'user@example.com',
  category: 'BILLING' as const,
  description: 'Não consigo ver a fatura do mês passado no painel.',
  user: {
    id: 'u1',
    name: 'Ana',
    email: 'ana@example.com',
    role: 'NUTRITIONIST',
  },
};

describe('SupportService.submit', () => {
  it('envia e-mail via Resend com subject e corpo esperados', async () => {
    const { svc, resend } = make();
    const out = await svc.submit(ticket);
    expect(out).toEqual({ ok: true });
    expect(resend.sendSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'inbox@inutri.life',
        from: 'iNutri Suporte <suporte@inutri.life>',
        replyTo: 'user@example.com',
        subject: '[iNutri Suporte] Pagamento / cobrança — Ana',
      }),
    );
    const text = resend.sendSupportEmail.mock.calls[0][0].text as string;
    expect(text).toContain('Pagamento / cobrança');
    expect(text).toContain(ticket.description);
    expect(text).toContain('u1');
  });

  it('503 quando SUPPORT_INBOX_EMAIL ou SUPPORT_FROM_EMAIL faltam', async () => {
    const { svc } = make({ SUPPORT_INBOX_EMAIL: undefined, SUPPORT_FROM_EMAIL: 'x' });
    await expect(svc.submit(ticket)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
