import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';

export interface EvolutionBranding {
  displayName: string | null;
  logoDataUrl: string | null;
}

export interface EvolutionAssessment {
  assessmentDate: Date | string;
  weight: number | null;
  bodyFatPercentage: number | null;
  muscleMass: number | null;
  leanMass: number | null;
  visceralFat: number | null;
  basalMetabolicRate: number | null;
  bodyWaterPercentage: number | null;
  boneMass: number | null;
  metabolicAge: number | null;
  waistCircumference: number | null;
  hipCircumference: number | null;
  chestCircumference: number | null;
  armCircumference: number | null;
  thighCircumference: number | null;
}

export interface EvolutionDocInput {
  patientName: string;
  height: number | null;
  assessments: EvolutionAssessment[];
  branding: EvolutionBranding;
}

const TEAL = '#14bfa6';
const CHART_W = 515;
const CHART_H = 130;
const PAD_X = 10;
const PAD_Y = 14;

const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR');
const fmtNum = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR'));

function bmiOf(weight: number | null, height: number | null): number | null {
  if (weight == null || height == null || height <= 0) return null;
  return Math.round((weight / (height / 100) ** 2) * 10) / 10;
}

// A single-metric trend chart as a pdfmake canvas node, or a note when there are
// fewer than two data points. Scaling ported from the mobile LineChart.
function drawChart(series: { x: number; y: number }[]): Content {
  if (series.length < 2) {
    return { text: 'dados insuficientes', style: 'muted', margin: [0, 0, 0, 8] };
  }
  const xs = series.map((p) => p.x);
  const ys = series.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const px = (x: number) =>
    xMax === xMin ? CHART_W / 2 : PAD_X + ((x - xMin) / (xMax - xMin)) * (CHART_W - 2 * PAD_X);
  const py = (y: number) =>
    CHART_H - PAD_Y - ((y - yMin) / (yMax - yMin)) * (CHART_H - 2 * PAD_Y);

  const canvas: Record<string, unknown>[] = [];
  [PAD_Y, CHART_H / 2, CHART_H - PAD_Y].forEach((gy) => {
    canvas.push({ type: 'line', x1: PAD_X, y1: gy, x2: CHART_W - PAD_X, y2: gy, lineWidth: 0.5, lineColor: '#dddddd' });
  });
  canvas.push({
    type: 'polyline',
    lineWidth: 1.5,
    lineColor: TEAL,
    points: series.map((p) => ({ x: px(p.x), y: py(p.y) })),
  });
  series.forEach((p) => {
    canvas.push({ type: 'ellipse', x: px(p.x), y: py(p.y), color: TEAL, r1: 2, r2: 2 });
  });
  return { canvas, margin: [0, 0, 0, 10] } as unknown as Content;
}

const CHART_METRICS: { key: keyof EvolutionAssessment; label: string }[] = [
  { key: 'weight', label: 'Peso (kg)' },
  { key: 'bodyFatPercentage', label: '% Gordura' },
  { key: 'muscleMass', label: 'Massa muscular (kg)' },
  { key: 'leanMass', label: 'Massa magra (kg)' },
];

function th(text: string): TableCell {
  return { text, style: 'th' };
}

function compositionTable(assessments: EvolutionAssessment[], height: number | null): Content {
  const body: TableCell[][] = [
    [th('Data'), th('Peso'), th('IMC'), th('%Gord'), th('M.Musc'), th('M.Magra'), th('Visceral'), th('TMB'), th('%Água'), th('Óssea'), th('Id.Metab')],
  ];
  assessments.forEach((a) => {
    body.push([
      { text: fmtDate(a.assessmentDate) },
      { text: fmtNum(a.weight) },
      { text: fmtNum(bmiOf(a.weight, height)) },
      { text: fmtNum(a.bodyFatPercentage) },
      { text: fmtNum(a.muscleMass) },
      { text: fmtNum(a.leanMass) },
      { text: fmtNum(a.visceralFat) },
      { text: fmtNum(a.basalMetabolicRate) },
      { text: fmtNum(a.bodyWaterPercentage) },
      { text: fmtNum(a.boneMass) },
      { text: fmtNum(a.metabolicAge) },
    ]);
  });
  return {
    table: { headerRows: 1, widths: Array(11).fill('auto'), body },
    layout: 'lightHorizontalLines',
    fontSize: 8,
    margin: [0, 0, 0, 6],
  } as Content;
}

function circumferenceTable(assessments: EvolutionAssessment[]): Content {
  const body: TableCell[][] = [
    [th('Data'), th('Cintura'), th('Quadril'), th('Tórax'), th('Braço'), th('Coxa')],
  ];
  assessments.forEach((a) => {
    body.push([
      { text: fmtDate(a.assessmentDate) },
      { text: fmtNum(a.waistCircumference) },
      { text: fmtNum(a.hipCircumference) },
      { text: fmtNum(a.chestCircumference) },
      { text: fmtNum(a.armCircumference) },
      { text: fmtNum(a.thighCircumference) },
    ]);
  });
  return {
    table: { headerRows: 1, widths: ['*', '*', '*', '*', '*', '*'], body },
    layout: 'lightHorizontalLines',
    fontSize: 8,
    margin: [0, 0, 0, 6],
  } as Content;
}

function docShell(content: Content[]): TDocumentDefinitions {
  return {
    content,
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    pageMargins: [40, 40, 40, 40],
    styles: {
      brand: { fontSize: 14, bold: true },
      title: { fontSize: 16, bold: true },
      section: { fontSize: 12, bold: true },
      chartLabel: { fontSize: 10, bold: true, color: '#444444' },
      muted: { fontSize: 9, color: '#666666' },
      th: { bold: true, fontSize: 8, color: '#666666' },
    },
    footer: (currentPage: number, pageCount: number): Content => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#999999',
      margin: [0, 8, 0, 0],
    }),
  };
}

export function buildEvolutionDocDefinition(input: EvolutionDocInput): TDocumentDefinitions {
  const { patientName, height, branding } = input;
  const assessments = [...input.assessments].sort(
    (a, b) => new Date(a.assessmentDate).getTime() - new Date(b.assessmentDate).getTime(),
  );

  const content: Content[] = [];

  const headerCols: Content[] = [];
  if (branding.logoDataUrl) headerCols.push({ image: branding.logoDataUrl, fit: [70, 70], width: 70 });
  headerCols.push({ text: branding.displayName ?? '', style: 'brand', margin: [branding.logoDataUrl ? 12 : 0, 6, 0, 0] });
  content.push({ columns: headerCols, columnGap: 8 });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 4, x2: CHART_W, y2: 4, lineWidth: 0.5, lineColor: '#cccccc' }], margin: [0, 4, 0, 8] });

  content.push({ text: `Evolução — ${patientName}`, style: 'title' });
  const range = assessments.length
    ? `${fmtDate(assessments[0].assessmentDate)} a ${fmtDate(assessments[assessments.length - 1].assessmentDate)}`
    : '—';
  content.push({ text: range, style: 'muted', margin: [0, 0, 0, 10] });

  if (assessments.length === 0) {
    content.push({ text: 'Nenhuma avaliação registrada.', style: 'muted' });
    return docShell(content);
  }

  content.push({ text: 'Tendências', style: 'section', margin: [0, 4, 0, 6] });
  CHART_METRICS.forEach((m) => {
    content.push({ text: m.label, style: 'chartLabel', margin: [0, 4, 0, 2] });
    const series = assessments
      .map((a, i) => ({ x: i, y: a[m.key] as number | null }))
      .filter((p): p is { x: number; y: number } => p.y != null);
    content.push(drawChart(series));
  });

  content.push({ text: 'Histórico — composição', style: 'section', margin: [0, 8, 0, 4] });
  content.push(compositionTable(assessments, height));

  content.push({ text: 'Histórico — circunferências (cm)', style: 'section', margin: [0, 10, 0, 4] });
  content.push(circumferenceTable(assessments));

  return docShell(content);
}
