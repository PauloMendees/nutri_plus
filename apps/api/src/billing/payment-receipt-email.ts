import { escapeHtml, wrapTransactionalEmail } from '../support/transactional-email';

export type ReceiptVariant = 'welcome' | 'renewal';

export interface PaymentReceiptInput {
  variant: ReceiptVariant;
  name: string;
  plan: 'ESSENCIAL' | 'PRO' | null;
  period: 'MONTHLY' | 'YEARLY' | null;
  amount: number;
  periodEnd: Date;
  dashboardUrl: string;
}

const PLAN_LABEL: Record<'ESSENCIAL' | 'PRO', string> = {
  ESSENCIAL: 'Essencial',
  PRO: 'Pro',
};

const PERIOD_LABEL: Record<'MONTHLY' | 'YEARLY', string> = {
  MONTHLY: 'mensal',
  YEARLY: 'anual',
};

function formatBrl(amount: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function planPhrase(plan: PaymentReceiptInput['plan'], period: PaymentReceiptInput['period']): string {
  const tier = plan ? PLAN_LABEL[plan] : null;
  const cycle = period ? PERIOD_LABEL[period] : null;
  if (tier && cycle) return `${tier} ${cycle}`;
  if (tier) return tier;
  return 'sua assinatura';
}

export function buildPaymentReceiptEmail(input: PaymentReceiptInput): {
  subject: string;
  text: string;
  html: string;
} {
  const tier = input.plan ? PLAN_LABEL[input.plan] : null;
  const subject =
    input.variant === 'welcome'
      ? tier
        ? `Bem-vindo ao iNutri — assinatura ${tier} ativada`
        : 'Bem-vindo ao iNutri — assinatura ativada'
      : tier
        ? `Pagamento confirmado — iNutri ${tier}`
        : 'Pagamento confirmado — iNutri';

  const amount = formatBrl(input.amount);
  const when = formatDate(input.periodEnd);
  const plan = planPhrase(input.plan, input.period);
  const opening =
    input.variant === 'welcome'
      ? `Sua assinatura está ativa. Bem-vindo ao iNutri.`
      : `Recebemos o pagamento da sua renovação ${plan}.`;

  const details = [
    input.variant === 'welcome' ? `Plano: ${plan}` : null,
    `Valor pago: ${amount}`,
    `Próximo vencimento: ${when}`,
    `Acesse o dashboard: ${input.dashboardUrl}`,
  ].filter((line): line is string => line !== null);

  const text = [`Olá, ${input.name}.`, '', opening, '', ...details].join('\n');

  const p = 'margin:0 0 24px;font-size:15px;line-height:1.6;color:#5b6b64;';
  const htmlOpening =
    input.variant === 'welcome'
      ? `<p style="${p}">Sua assinatura está ativa. Bem-vindo ao iNutri.</p>`
      : `<p style="${p}">Recebemos o pagamento da sua renovação ${escapeHtml(plan)}.</p>`;

  const detailRow = (label: string, value: string) =>
    `<tr>
      <td style="padding:8px 0;font-size:14px;color:#5b6b64;width:48%;">${label}</td>
      <td style="padding:8px 0;font-size:14px;color:#0f1714;font-weight:600;">${value}</td>
    </tr>`;

  const htmlDetails = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid #e7ece9;">
    ${input.variant === 'welcome' ? detailRow('Plano', escapeHtml(plan)) : ''}
    ${detailRow('Valor pago', escapeHtml(amount))}
    ${detailRow('Próximo vencimento', escapeHtml(when))}
  </table>`;

  const html = wrapTransactionalEmail({
    title: input.variant === 'welcome' ? 'Assinatura ativada' : 'Pagamento confirmado',
    preheader: opening,
    bodyHtml: `<p style="${p}">Olá, ${escapeHtml(input.name)}.</p>${htmlOpening}${htmlDetails}`,
    cta: { href: input.dashboardUrl, label: 'Acessar o dashboard' },
  });

  return { subject, text, html };
}
