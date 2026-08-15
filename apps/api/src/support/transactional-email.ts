const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BODY_P = 'margin:0 0 24px;font-size:15px;line-height:1.6;color:#5b6b64;';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wrapTransactionalEmail(input: {
  title: string;
  preheader?: string;
  bodyHtml: string;
  cta?: { href: string; label: string };
  footer?: string;
}): string {
  const title = escapeHtml(input.title);
  const preheader = input.preheader ? escapeHtml(input.preheader) : '';
  const href = input.cta ? escapeHtml(input.cta.href) : '';
  const label = input.cta ? escapeHtml(input.cta.label) : '';
  const footer = input.footer ? escapeHtml(input.footer) : '';

  const ctaBlock = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td align="center" bgcolor="#14bfa6" style="border-radius:999px;">
                  <a href="${href}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${label}</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#5b6b64;">Se o botão não funcionar, copie e cole este link no navegador:</p>
            <p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${href}" target="_blank" style="color:#0a5c45;text-decoration:underline;">${href}</a></p>`
    : '';

  return `${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>\n` : ''}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:24px 0;background-color:#f2f7f5;font-family:${FONT};">
  <tr>
    <td align="center" style="padding:0 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:480px;background-color:#ffffff;border:1px solid #d8e2dd;border-radius:16px;overflow:hidden;">
        <tr>
          <td align="center" style="background-color:#0a5c45;padding:28px 24px;">
            <span style="font-size:26px;font-weight:700;letter-spacing:-0.5px;color:#ffffff;">i<span style="color:#5fd6c2;">nutri</span></span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px;">
            <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;color:#0f1714;">${title}</h1>
            ${input.bodyHtml}
            ${ctaBlock}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #e7ece9;">
            ${footer ? `<p style="margin:0;font-size:12px;line-height:1.6;color:#8a968f;">${footer}</p>` : ''}
            <p style="margin:${footer ? '12px' : '0'} 0 0;font-size:12px;color:#8a968f;">© 2026 iNutri</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

export function buildConfirmSignupEmailHtml(): string {
  return wrapTransactionalEmail({
    title: 'Confirme seu e-mail',
    preheader: 'Confirme seu e-mail para ativar sua conta no iNutri.',
    bodyHtml: `<p style="${BODY_P}">Falta pouco! Clique no botão abaixo para confirmar seu e-mail e ativar sua conta no iNutri.</p>`,
    cta: { href: '{{ .ConfirmationURL }}', label: 'Confirmar e-mail' },
    footer: 'Se você não criou uma conta no iNutri, pode ignorar este e-mail com segurança.',
  });
}

export function buildResetPasswordEmailHtml(): string {
  return wrapTransactionalEmail({
    title: 'Redefinir senha',
    preheader: 'Use o botão abaixo para escolher uma nova senha.',
    bodyHtml: `<p style="${BODY_P}">Recebemos um pedido para redefinir a senha da sua conta iNutri.</p><p style="${BODY_P}">Código para o app: <strong>{{ .Token }}</strong></p>`,
    cta: { href: '{{ .ConfirmationURL }}', label: 'Redefinir senha' },
    footer: 'Se você não pediu para redefinir a senha, pode ignorar este e-mail com segurança.',
  });
}

export function buildInviteEmailHtml(): string {
  return wrapTransactionalEmail({
    title: 'Você foi convidado para o iNutri',
    preheader: 'Defina sua senha para acessar o app.',
    bodyHtml: `<p style="${BODY_P}">Olá{{ if .Data.name }}, {{ .Data.name }}{{ end }}.</p><p style="${BODY_P}">Sua conta foi criada. Defina uma senha para começar.</p>`,
    cta: { href: '{{ .ConfirmationURL }}', label: 'Definir senha' },
    footer: 'Se você não esperava este convite, pode ignorar este e-mail com segurança.',
  });
}
