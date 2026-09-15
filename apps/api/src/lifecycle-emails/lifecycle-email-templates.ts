import { escapeHtml, wrapTransactionalEmail } from '../support/transactional-email';

export interface LifecycleEmailOutput {
  subject: string;
  text: string;
  html: string;
}

const BODY_P = 'margin:0 0 24px;font-size:15px;line-height:1.6;color:#5b6b64;';
const LINK_P = 'margin:0 0 8px;font-size:13px;line-height:1.6;color:#5b6b64;';

const PLAN_LABEL: Record<'ESSENCIAL' | 'PRO', string> = {
  ESSENCIAL: 'Essencial',
  PRO: 'Pro',
};

const PERIOD_LABEL: Record<'MONTHLY' | 'YEARLY', string> = {
  MONTHLY: 'mensal',
  YEARLY: 'anual',
};

function capitalizeFirst(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// "Olá, {primeiro nome}." com inicial maiúscula; sem nome, "Olá, tudo bem."
function greeting(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return 'Olá, tudo bem.';
  const first = trimmed.split(/\s+/)[0];
  return `Olá, ${capitalizeFirst(first)}.`;
}

function formatBrDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

// "Pro mensal" / "Essencial anual"; sem plano, "escolhido".
function planPhrase(plan: 'ESSENCIAL' | 'PRO' | null, period: 'MONTHLY' | 'YEARLY' | null): string {
  const tier = plan ? PLAN_LABEL[plan] : null;
  const cycle = period ? PERIOD_LABEL[period] : null;
  if (tier && cycle) return `${tier} ${cycle}`;
  if (tier) return tier;
  return 'escolhido';
}

// Botão CTA no mesmo estilo visual do bloco embutido em wrapTransactionalEmail
// (support/transactional-email.ts), montado à mão aqui porque o teste
// TRIAL_NO_PATIENT precisa de um segundo link abaixo do botão — algo que o
// parâmetro `cta` de wrapTransactionalEmail não suporta (ele sempre renderiza
// depois do bodyHtml).
function ctaButtonHtml(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td align="center" bgcolor="#14bfa6" style="border-radius:999px;">
                  <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
                </td>
              </tr>
            </table>`;
}

export interface TrialNoPatientEmailInput {
  name: string | null | undefined;
  trialEndsAt: Date;
  webOrigin: string;
}

export function buildTrialNoPatientEmail(input: TrialNoPatientEmailInput): LifecycleEmailOutput {
  const subject = 'Seu teste do iNutri está esperando o primeiro paciente';
  const preheader = 'Dez minutos bastam para ver um plano pronto: cadastre um paciente e gere com a IA.';
  const hello = greeting(input.name);
  const trialEndsAt = formatBrDate(input.trialEndsAt);
  const link = `${input.webOrigin}/patients/new`;
  const linkImportar = `${input.webOrigin}/patients/import`;

  const text = [
    hello,
    '',
    'Você ativou o teste do iNutri há alguns dias e ainda não cadastrou nenhum paciente. Sem uma ficha, não dá para ver o que o sistema faz de melhor.',
    '',
    'Uma sugestão para os próximos dez minutos. Cadastre um paciente, real ou fictício. Registre peso e altura. Clique em "Gerar com IA". O plano sai em um ou dois minutos, com as metas calculadas a partir da ficha, e você ajusta o que quiser no editor. O critério continua sendo seu.',
    '',
    'Se a sua base está em planilha ou em outro sistema, importe tudo de uma vez: modelo do iNutri ou qualquer Excel/CSV.',
    '',
    `Cadastrar o primeiro paciente: ${link}`,
    `Importar uma planilha: ${linkImportar}`,
    '',
    `Seu teste vai até ${trialEndsAt}. Se precisar de mais tempo para avaliar com calma, responda a este e-mail e eu estendo.`,
    '',
    'Paulo Mendes',
    'iNutri',
  ].join('\n');

  const bodyHtml = `<p style="${BODY_P}">${escapeHtml(hello)}</p>
    <p style="${BODY_P}">Você ativou o teste do iNutri há alguns dias e ainda não cadastrou nenhum paciente. Sem uma ficha, não dá para ver o que o sistema faz de melhor.</p>
    <p style="${BODY_P}">Uma sugestão para os próximos dez minutos. Cadastre um paciente, real ou fictício. Registre peso e altura. Clique em "Gerar com IA". O plano sai em um ou dois minutos, com as metas calculadas a partir da ficha, e você ajusta o que quiser no editor. O critério continua sendo seu.</p>
    <p style="${BODY_P}">Se a sua base está em planilha ou em outro sistema, importe tudo de uma vez: modelo do iNutri ou qualquer Excel/CSV.</p>
    ${ctaButtonHtml(link, 'Cadastrar o primeiro paciente')}
    <p style="${LINK_P}">Ou <a href="${escapeHtml(linkImportar)}" target="_blank" style="color:#0a5c45;text-decoration:underline;">importar uma planilha</a></p>
    <p style="${BODY_P}">Seu teste vai até ${trialEndsAt}. Se precisar de mais tempo para avaliar com calma, responda a este e-mail e eu estendo.</p>
    <p style="${BODY_P}">Paulo Mendes<br>iNutri</p>`;

  const html = wrapTransactionalEmail({
    title: 'Seu teste está esperando o primeiro paciente',
    preheader,
    bodyHtml,
    footer:
      'Você recebe este e-mail porque ativou um teste no iNutri. Para não receber avisos como este, responda com "não quero".',
  });

  return { subject, text, html };
}

export interface CheckoutAbandonedEmailInput {
  name: string | null | undefined;
  plan: 'ESSENCIAL' | 'PRO' | null;
  period: 'MONTHLY' | 'YEARLY' | null;
  // Nulo quando a cobrança foi gerada sem a pessoa nunca ter passado pelo
  // trial (checkout direto) — nesse caso não há data de "acesso até" para
  // mostrar, e a frase correspondente sai sem ela (ver `accessSentence`).
  trialEndsAt: Date | null;
  webOrigin: string;
}

// "seu acesso segue até {data}, e este é o único lembrete que enviamos." —
// sem data (checkout sem trial), vira só "este é o único lembrete que enviamos.".
function accessSentence(trialEndsAt: Date | null): string {
  if (!trialEndsAt) {
    return 'Se preferiu não assinar agora, tudo bem: este é o único lembrete que enviamos.';
  }
  return `Se preferiu não assinar agora, tudo bem: seu acesso segue até ${formatBrDate(trialEndsAt)}, e este é o único lembrete que enviamos.`;
}

export function buildCheckoutAbandonedEmail(input: CheckoutAbandonedEmailInput): LifecycleEmailOutput {
  const subject = 'Seu Pix do iNutri venceu antes da hora';
  const preheader = 'O Pix venceu no mesmo dia em que foi gerado. Nada foi cobrado, e você pode gerar outro quando quiser.';
  const hello = greeting(input.name);
  const plan = planPhrase(input.plan, input.period);
  const access = accessSentence(input.trialEndsAt);
  const link = `${input.webOrigin}/assinatura`;

  const text = [
    hello,
    '',
    `Você gerou uma cobrança do plano ${plan} no iNutri e o pagamento não foi concluído. Ao conferir, vimos que o Pix venceu no mesmo dia em que foi gerado, o que deixou pouco tempo para pagar. Pedimos desculpas pelo transtorno.`,
    '',
    'Nada foi cobrado, e sua conta continua ativa. Quando quiser assinar, gere uma nova cobrança em Assinatura: o Pix aparece na hora e o plano é liberado assim que o pagamento é confirmado.',
    '',
    `Assinar o plano ${plan}: ${link}`,
    '',
    access,
    '',
    'Se houve algum problema no pagamento, responda a este e-mail e eu resolvo com você.',
    '',
    'Paulo Mendes',
    'iNutri',
  ].join('\n');

  const bodyHtml = `<p style="${BODY_P}">${escapeHtml(hello)}</p>
    <p style="${BODY_P}">Você gerou uma cobrança do plano ${escapeHtml(plan)} no iNutri e o pagamento não foi concluído. Ao conferir, vimos que o Pix venceu no mesmo dia em que foi gerado, o que deixou pouco tempo para pagar. Pedimos desculpas pelo transtorno.</p>
    <p style="${BODY_P}">Nada foi cobrado, e sua conta continua ativa. Quando quiser assinar, gere uma nova cobrança em Assinatura: o Pix aparece na hora e o plano é liberado assim que o pagamento é confirmado.</p>
    ${ctaButtonHtml(link, `Assinar o plano ${plan}`)}
    <p style="${BODY_P}">${access}</p>
    <p style="${BODY_P}">Se houve algum problema no pagamento, responda a este e-mail e eu resolvo com você.</p>
    <p style="${BODY_P}">Paulo Mendes<br>iNutri</p>`;

  const html = wrapTransactionalEmail({
    title: 'Seu Pix venceu antes da hora',
    preheader,
    bodyHtml,
    footer:
      'Você recebe este e-mail porque iniciou uma assinatura no iNutri. Para não receber avisos como este, responda com "não quero".',
  });

  return { subject, text, html };
}
