import { buildTrialNoPatientEmail, buildCheckoutAbandonedEmail } from './lifecycle-email-templates';

const WEB_ORIGIN = 'https://app.inutri.com.br';
const TRIAL_ENDS_AT = new Date('2026-09-20T12:00:00Z');

describe('buildTrialNoPatientEmail', () => {
  it('usa o assunto exato', () => {
    const mail = buildTrialNoPatientEmail({
      name: 'Elizabeth Fonseca',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.subject).toBe('Seu teste do iNutri está esperando o primeiro paciente');
  });

  it('saúda pelo primeiro nome, com inicial maiúscula', () => {
    const mail = buildTrialNoPatientEmail({
      name: 'Elizabeth Fonseca',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.text).toContain('Olá, Elizabeth.');
  });

  it('sem nome, saúda com "Olá, tudo bem."', () => {
    const mail = buildTrialNoPatientEmail({
      name: null,
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.text).toContain('Olá, tudo bem.');
  });

  it('formata a data do fim do teste em pt-BR (dd/mm/aaaa)', () => {
    const mail = buildTrialNoPatientEmail({
      name: 'Elizabeth Fonseca',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.text).toContain('20/09/2026');
  });

  it('inclui os links de cadastro e importação com o webOrigin', () => {
    const mail = buildTrialNoPatientEmail({
      name: 'Elizabeth Fonseca',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.text).toContain(`${WEB_ORIGIN}/patients/new`);
    expect(mail.text).toContain(`${WEB_ORIGIN}/patients/import`);
    expect(mail.html).toContain(`${WEB_ORIGIN}/patients/new`);
    expect(mail.html).toContain(`${WEB_ORIGIN}/patients/import`);
  });

  it('escapa HTML perigoso vindo do nome', () => {
    const mail = buildTrialNoPatientEmail({
      name: '<script>alert(1)</script>',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.html).not.toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('preheader e rodapé exatos', () => {
    const mail = buildTrialNoPatientEmail({
      name: 'Elizabeth Fonseca',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.html).toContain(
      'Dez minutos bastam para ver um plano pronto: cadastre um paciente e gere com a IA.',
    );
    expect(mail.html).toContain(
      'Você recebe este e-mail porque ativou um teste no iNutri. Para não receber avisos como este, responda com &quot;não quero&quot;.',
    );
  });
});

describe('buildCheckoutAbandonedEmail', () => {
  it('usa o assunto exato', () => {
    const mail = buildCheckoutAbandonedEmail({
      name: 'Elizabeth Fonseca',
      plan: 'PRO',
      period: 'MONTHLY',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.subject).toBe('Seu Pix do iNutri venceu antes da hora');
  });

  it('sem nome, saúda com "Olá, tudo bem."', () => {
    const mail = buildCheckoutAbandonedEmail({
      name: null,
      plan: 'PRO',
      period: 'MONTHLY',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.text).toContain('Olá, tudo bem.');
  });

  it('plano PRO/MONTHLY vira "Pro mensal"', () => {
    const mail = buildCheckoutAbandonedEmail({
      name: 'Elizabeth Fonseca',
      plan: 'PRO',
      period: 'MONTHLY',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.text).toContain('Pro mensal');
    expect(mail.html).toContain('Pro mensal');
  });

  it('plano ESSENCIAL/YEARLY vira "Essencial anual"', () => {
    const mail = buildCheckoutAbandonedEmail({
      name: 'Elizabeth Fonseca',
      plan: 'ESSENCIAL',
      period: 'YEARLY',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.text).toContain('Essencial anual');
  });

  it('sem plano, usa "escolhido"', () => {
    const mail = buildCheckoutAbandonedEmail({
      name: 'Elizabeth Fonseca',
      plan: null,
      period: null,
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.text).toContain('plano escolhido');
  });

  it('formata a data de fim do acesso em pt-BR (dd/mm/aaaa)', () => {
    const mail = buildCheckoutAbandonedEmail({
      name: 'Elizabeth Fonseca',
      plan: 'PRO',
      period: 'MONTHLY',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.text).toContain('20/09/2026');
  });

  it('inclui o link de assinatura com o webOrigin', () => {
    const mail = buildCheckoutAbandonedEmail({
      name: 'Elizabeth Fonseca',
      plan: 'PRO',
      period: 'MONTHLY',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.text).toContain(`${WEB_ORIGIN}/assinatura`);
    expect(mail.html).toContain(`${WEB_ORIGIN}/assinatura`);
  });

  it('escapa HTML perigoso vindo do nome', () => {
    const mail = buildCheckoutAbandonedEmail({
      name: '<script>alert(1)</script>',
      plan: 'PRO',
      period: 'MONTHLY',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.html).not.toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('preheader e rodapé exatos', () => {
    const mail = buildCheckoutAbandonedEmail({
      name: 'Elizabeth Fonseca',
      plan: 'PRO',
      period: 'MONTHLY',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.html).toContain(
      'O Pix venceu no mesmo dia em que foi gerado. Nada foi cobrado, e você pode gerar outro quando quiser.',
    );
    expect(mail.html).toContain(
      'Você recebe este e-mail porque iniciou uma assinatura no iNutri. Para não receber avisos como este, responda com &quot;não quero&quot;.',
    );
  });
});
