import { escapeHtml, wrapTransactionalEmail } from '../support/transactional-email';

export interface PatientDeletedEmailInput {
  patientName: string;
  nutritionistName: string;
  fileName: string;
}

const BODY_P = 'margin:0 0 20px;font-size:15px;line-height:1.6;color:#5b6b64;';

function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
}

// E-mail enviado ao paciente ANTES da exclusão feita pela nutricionista, com o
// JSON dos dados anexado (acesso/portabilidade, LGPD art. 18).
export function buildPatientDeletedEmail(input: PatientDeletedEmailInput) {
  const who = input.nutritionistName;
  const hello = firstName(input.patientName) ? `Olá, ${firstName(input.patientName)}.` : 'Olá.';
  const subject = `Seus dados no iNutri — cadastro encerrado por ${who}`;
  const paragraphs = [
    `${who} encerrou o seu cadastro no iNutri, e os seus dados foram apagados da plataforma. Se você usava o app do iNutri, o acesso também foi removido.`,
    // A lista espelha exatamente o que buildPatientExport exporta — prometer
    // "tudo" seria falso: áudios e foto são apagados sem ir para o anexo.
    `Em anexo (${input.fileName}) está uma cópia dos seus dados: dados de cadastro, anamnese, avaliações físicas, planos alimentares, recordatórios, metas, estimativas do Silhueta, consultas, consentimentos, transcrições de consultas, registros do diário e pedidos de sugestão fora de casa. As gravações de áudio das consultas e a foto de perfil não estão incluídas.`,
    'O arquivo está em JSON, um formato de texto aberto: pode ser aberto em qualquer editor de texto e entregue a outro profissional. Esta cópia atende ao seu direito de acesso e portabilidade previsto na LGPD (Lei 13.709/2018, art. 18).',
    'Guarde o arquivo: depois desta exclusão não é possível recuperar os dados pelo iNutri.',
    `Dúvidas sobre o encerramento: responda este e-mail para falar com ${who}.`,
  ];
  const text = [hello, ...paragraphs].join('\n\n');
  const bodyHtml = [hello, ...paragraphs]
    .map((p) => `<p style="${BODY_P}">${escapeHtml(p)}</p>`)
    .join('\n');
  const html = wrapTransactionalEmail({
    title: 'Seu cadastro no iNutri foi encerrado',
    preheader: `Cópia dos seus dados em anexo — ${who}`,
    bodyHtml,
  });
  return { subject, text, html };
}
