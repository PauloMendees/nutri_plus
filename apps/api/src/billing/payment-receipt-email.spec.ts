import { buildPaymentReceiptEmail } from './payment-receipt-email';

const base = {
  name: 'Ana',
  plan: 'PRO' as const,
  period: 'MONTHLY' as const,
  amount: 99,
  periodEnd: new Date('2026-09-10T00:00:00.000Z'),
  dashboardUrl: 'https://app.inutri.life',
};

describe('buildPaymentReceiptEmail', () => {
  it('welcome: assunto + cumprimento + CTA', () => {
    const mail = buildPaymentReceiptEmail({ ...base, variant: 'welcome' });
    expect(mail.subject).toBe('Bem-vindo ao iNutri — assinatura Pro ativada');
    expect(mail.text).toMatch(/Olá, Ana/);
    expect(mail.text).toMatch(/sua assinatura está ativa/i);
    expect(mail.text).toMatch(/R\$\s*99,00/);
    expect(mail.text).toMatch(/10\/09\/2026/);
    expect(mail.text).toContain('https://app.inutri.life');
    expect(mail.html).toContain('https://app.inutri.life');
    expect(mail.html).toContain('i<span style="color:#5fd6c2;">nutri</span>');
    expect(mail.html).toContain('#14bfa6');
    expect(mail.html).toContain('Acessar o dashboard');
  });

  it('renewal: assunto de confirmação, sem bem-vindo', () => {
    const mail = buildPaymentReceiptEmail({ ...base, variant: 'renewal' });
    expect(mail.subject).toBe('Pagamento confirmado — iNutri Pro');
    expect(mail.text).toMatch(/recebemos o pagamento da sua renovação/i);
    expect(mail.text).not.toMatch(/Bem-vindo/);
    expect(mail.subject).not.toMatch(/Bem-vindo/);
  });

  it('escapa HTML no nome', () => {
    const mail = buildPaymentReceiptEmail({ ...base, variant: 'welcome', name: '<img src=x>' });
    expect(mail.html).toContain('&lt;img src=x&gt;');
    expect(mail.html).not.toContain('<img src=x>');
  });

  it('plan null omite o tier no assunto', () => {
    const mail = buildPaymentReceiptEmail({ ...base, variant: 'welcome', plan: null });
    expect(mail.subject).toBe('Bem-vindo ao iNutri — assinatura ativada');
    expect(mail.text).toMatch(/sua assinatura/);
  });
});
