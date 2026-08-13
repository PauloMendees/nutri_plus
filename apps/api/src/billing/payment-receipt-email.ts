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

  const htmlOpening =
    input.variant === 'welcome'
      ? `<p>Sua assinatura está ativa. Bem-vindo ao iNutri.</p>`
      : `<p>Recebemos o pagamento da sua renovação ${plan}.</p>`;

  const htmlDetails = [
    input.variant === 'welcome' ? `<p>Plano: ${plan}</p>` : '',
    `<p>Valor pago: ${amount}</p>`,
    `<p>Próximo vencimento: ${when}</p>`,
    `<p><a href="${input.dashboardUrl}">Acesse o dashboard</a></p>`,
  ].join('');

  const html = `<p>Olá, ${input.name}.</p>${htmlOpening}${htmlDetails}`;

  return { subject, text, html };
}
