import { buildTrialNoPatientEmail, buildCheckoutAbandonedEmail, buildTrialNotStartedEmail } from './lifecycle-email-templates';

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

  it('título do HTML exato', () => {
    const mail = buildTrialNoPatientEmail({
      name: 'Elizabeth Fonseca',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.html).toContain('<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;color:#0f1714;">Seu teste está esperando o primeiro paciente</h1>');
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
    expect(mail.subject).toBe('Faltou um passo para ativar o seu plano');
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
      'A cobrança foi gerada, mas o pagamento não chegou. Quando quiser, é só gerar outra.',
    );
    expect(mail.html).toContain(
      'Você recebe este e-mail porque iniciou uma assinatura no iNutri. Para não receber avisos como este, responda com &quot;não quero&quot;.',
    );
  });

  it('título do HTML exato', () => {
    const mail = buildCheckoutAbandonedEmail({
      name: 'Elizabeth Fonseca',
      plan: 'PRO',
      period: 'MONTHLY',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.html).toContain('<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;color:#0f1714;">Faltou um passo para ativar o seu plano</h1>');
  });

  it('sem trialEndsAt (checkout sem trial), a frase de acesso vem sem data', () => {
    const mail = buildCheckoutAbandonedEmail({
      name: 'Elizabeth Fonseca',
      plan: 'PRO',
      period: 'MONTHLY',
      trialEndsAt: null,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.text).toContain(
      'Se preferiu não assinar agora, tudo bem: este é o único lembrete que enviamos.',
    );
    expect(mail.text).not.toContain('seu acesso segue até');
    expect(mail.html).toContain(
      'Se preferiu não assinar agora, tudo bem: este é o único lembrete que enviamos.',
    );
    expect(mail.html).not.toContain('seu acesso segue até');
  });

  it('com trialEndsAt, a frase de acesso mantém a data', () => {
    const mail = buildCheckoutAbandonedEmail({
      name: 'Elizabeth Fonseca',
      plan: 'PRO',
      period: 'MONTHLY',
      trialEndsAt: TRIAL_ENDS_AT,
      webOrigin: WEB_ORIGIN,
    });
    expect(mail.text).toContain(
      'Se preferiu não assinar agora, tudo bem: seu acesso segue até 20/09/2026, e este é o único lembrete que enviamos.',
    );
  });
});

describe('buildTrialNotStartedEmail', () => {
  it('usa o assunto exato', () => {
    const mail = buildTrialNotStartedEmail({ name: 'Elizabeth Fonseca', webOrigin: WEB_ORIGIN });
    expect(mail.subject).toBe('Seu teste do iNutri ainda não começou');
  });

  it('saúda pelo primeiro nome, com inicial maiúscula', () => {
    const mail = buildTrialNotStartedEmail({ name: 'Elizabeth Fonseca', webOrigin: WEB_ORIGIN });
    expect(mail.text).toContain('Olá, Elizabeth.');
  });

  it('sem nome, saúda com "Olá, tudo bem."', () => {
    const mail = buildTrialNotStartedEmail({ name: null, webOrigin: WEB_ORIGIN });
    expect(mail.text).toContain('Olá, tudo bem.');
  });

  it('inclui o link de assinatura com o webOrigin', () => {
    const mail = buildTrialNotStartedEmail({ name: 'Elizabeth Fonseca', webOrigin: WEB_ORIGIN });
    expect(mail.text).toContain(`${WEB_ORIGIN}/assinatura`);
    expect(mail.html).toContain(`${WEB_ORIGIN}/assinatura`);
  });

  it('escapa HTML perigoso vindo do nome', () => {
    const mail = buildTrialNotStartedEmail({ name: '<script>alert(1)</script>', webOrigin: WEB_ORIGIN });
    expect(mail.html).not.toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('preheader e rodapé exatos', () => {
    const mail = buildTrialNotStartedEmail({ name: 'Elizabeth Fonseca', webOrigin: WEB_ORIGIN });
    expect(mail.html).toContain('Falta um clique para liberar os 7 dias com tudo incluído.');
    expect(mail.html).toContain(
      'Você recebe este e-mail porque criou uma conta no iNutri. Para não receber avisos como este, responda com &quot;não quero&quot;.',
    );
  });

  it('título do HTML exato', () => {
    const mail = buildTrialNotStartedEmail({ name: 'Elizabeth Fonseca', webOrigin: WEB_ORIGIN });
    expect(mail.html).toContain('<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;color:#0f1714;">Falta um clique para começar</h1>');
  });

  it('corpo do texto contém as frases-chave, verbatim', () => {
    const mail = buildTrialNotStartedEmail({ name: 'Elizabeth Fonseca', webOrigin: WEB_ORIGIN });
    expect(mail.text).toContain(
      'Você criou sua conta no iNutri, mas o período de teste ainda não foi iniciado. Sem ele, o sistema abre só para leitura: dá para olhar, não dá para cadastrar paciente nem gerar plano.',
    );
    expect(mail.text).toContain(
      'São 7 dias com tudo liberado, sem cartão: planos com IA, importação da sua base por planilha, agenda, ficha clínica e o aplicativo do paciente.',
    );
    expect(mail.text).toContain(`Começar meu teste: ${WEB_ORIGIN}/assinatura`);
    expect(mail.text).toContain(
      'Se tiver qualquer dúvida antes de começar, responda a este e-mail. Eu respondo pessoalmente.',
    );
    expect(mail.text).toContain('Paulo Mendes\niNutri');
  });

  it('CTA do HTML: "Começar meu teste" para /assinatura', () => {
    const mail = buildTrialNotStartedEmail({ name: 'Elizabeth Fonseca', webOrigin: WEB_ORIGIN });
    expect(mail.html).toContain('Começar meu teste');
    expect(mail.html).toContain(`${WEB_ORIGIN}/assinatura`);
  });
});
