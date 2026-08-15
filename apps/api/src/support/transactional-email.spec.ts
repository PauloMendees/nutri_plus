import {
  buildConfirmSignupEmailHtml,
  buildResetPasswordEmailHtml,
  wrapTransactionalEmail,
} from './transactional-email';

describe('wrapTransactionalEmail', () => {
  const html = wrapTransactionalEmail({
    title: 'Confirme seu e-mail',
    preheader: 'Clique para ativar sua conta iNutri.',
    bodyHtml: '<p>Olá, Ana.</p><p>Falta um passo para entrar no iNutri.</p>',
    cta: { href: 'https://app.inutri.life/auth/callback', label: 'Confirmar e-mail' },
  });

  it('usa o card, wordmark e botão teal do modelo de confirmação', () => {
    expect(html).toContain('i<span style="color:#5fd6c2;">nutri</span>');
    expect(html).toContain('#0a5c45');
    expect(html).toContain('#14bfa6');
    expect(html).toContain('color:#ffffff');
    expect(html).toContain('Confirmar e-mail');
    expect(html).toContain('https://app.inutri.life/auth/callback');
    expect(html).toContain('Confirme seu e-mail');
    expect(html).not.toContain('/brand/inutri-logo-horizontal.png');
  });

  it('inclui preheader e fallback do link do botão', () => {
    expect(html).toContain('Clique para ativar sua conta iNutri.');
    expect(html).toContain('Se o botão não funcionar');
  });
});

describe('templates de auth', () => {
  it('confirmação de cadastro usa ConfirmationURL e o copy do modelo', () => {
    const html = buildConfirmSignupEmailHtml();
    expect(html).toContain('{{ .ConfirmationURL }}');
    expect(html).toContain('Confirmar e-mail');
    expect(html).toContain('Falta pouco!');
    expect(html).toContain('Se você não criou uma conta no iNutri');
    expect(html).toContain('#14bfa6');
  });

  it('reset de senha inclui o link e o Token do app', () => {
    const html = buildResetPasswordEmailHtml();
    expect(html).toContain('{{ .ConfirmationURL }}');
    expect(html).toContain('{{ .Token }}');
    expect(html).toContain('Redefinir senha');
  });
});
