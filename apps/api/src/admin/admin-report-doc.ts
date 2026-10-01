import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { ADMIN_PLAN_LABELS, type AdminNutritionistFilters, type AdminNutritionistRow } from '@nutri-plus/shared-types';

const brDay = (ymd: string) => ymd.split('-').reverse().join('/');
const brDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export function describeFilters(f: AdminNutritionistFilters): string {
  const parts: string[] = [];
  if (f.search?.trim()) parts.push(`Busca: "${f.search.trim()}"`);
  if (f.confirmed) parts.push(`Confirmou: ${f.confirmed === 'yes' ? 'Sim' : 'Não'}`);
  if (f.plan) parts.push(`Plano: ${ADMIN_PLAN_LABELS[f.plan]}`);
  if (f.createdFrom || f.createdTo) {
    const from = f.createdFrom ? `de ${brDay(f.createdFrom)}` : '';
    const to = f.createdTo ? `até ${brDay(f.createdTo)}` : '';
    parts.push(`Cadastro: ${[from, to].filter(Boolean).join(' ')}`);
  }
  return parts.length ? parts.join(' · ') : 'Sem filtros';
}

const L = ADMIN_PLAN_LABELS;
const LEGEND: [string, string][] = [
  [L.COMP, 'acesso Pro concedido sem cobrança.'],
  [`${L.PRO} / ${L.ESSENCIAL}`, 'assinatura ativa e em dia.'],
  [L.TRIAL, 'período de teste em andamento.'],
  [L.TRIAL_ENDED, 'usou o teste grátis e não assinou.'],
  [L.EXPIRED, 'já foi assinante, mas o período pago acabou ou o pagamento não foi feito.'],
  [L.NONE, 'nunca iniciou teste nem assinatura.'],
  ['Confirmou: Não', 'se cadastrou, mas ainda não confirmou o e-mail.'],
];

// Relatório da listagem de nutricionistas do painel admin: todas as linhas que
// passam nos filtros (sem paginação), em A4 paisagem.
export function buildNutritionistsReportDoc(input: {
  rows: AdminNutritionistRow[];
  filters: AdminNutritionistFilters;
  generatedAt: Date;
}): TDocumentDefinitions {
  const { rows } = input;
  const generated = input.generatedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const header = ['Nome', 'E-mail', 'Telefone', 'Confirmou', 'Pacientes', 'Plano', 'Cadastro'].map((text) => ({
    text,
    bold: true,
  }));
  const body = rows.map((r) => [
    r.name,
    r.email,
    r.phone ?? '—',
    r.confirmed ? 'Sim' : 'Não',
    String(r.patientCount),
    ADMIN_PLAN_LABELS[r.plan],
    brDate(r.createdAt),
  ]);
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [32, 32, 32, 32],
    defaultStyle: { fontSize: 9 },
    content: [
      { text: 'Nutricionistas — iNutri', fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
      { text: `Gerado em ${generated}`, color: '#5b6b64', margin: [0, 0, 0, 2] },
      { text: describeFilters(input.filters), color: '#5b6b64', margin: [0, 0, 0, 2] },
      { text: `${rows.length} ${rows.length === 1 ? 'nutricionista' : 'nutricionistas'}`, margin: [0, 0, 0, 10] },
      rows.length
        ? {
            table: { headerRows: 1, widths: ['*', '*', 'auto', 'auto', 'auto', 'auto', 'auto'], body: [header, ...body] },
            layout: 'lightHorizontalLines',
          }
        : { text: 'Nenhuma nutricionista encontrada.', italics: true },
      { text: 'Legenda dos status', bold: true, margin: [0, 16, 0, 4] },
      {
        ul: LEGEND.map(([label, meaning]) => ({ text: [{ text: `${label}: `, bold: true }, meaning] })),
        color: '#5b6b64',
      },
    ],
  };
}
