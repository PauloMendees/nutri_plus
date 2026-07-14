import { buildEvolutionDocDefinition, EvolutionAssessment } from './evolution-doc';
import { renderPdf } from '../../meal-plans/pdf/pdf-printer';

function contentArray(doc: ReturnType<typeof buildEvolutionDocDefinition>): any[] {
  return doc.content as any[];
}

const rows: EvolutionAssessment[] = [
  { assessmentDate: '2026-01-10', weight: 80, bodyFatPercentage: 30, muscleMass: 30, leanMass: 55, visceralFat: 10, basalMetabolicRate: 1500, bodyWaterPercentage: 50, boneMass: 3, metabolicAge: 40, waistCircumference: 90, hipCircumference: 100, chestCircumference: 95, armCircumference: 32, thighCircumference: 55 },
  { assessmentDate: '2026-02-10', weight: 78, bodyFatPercentage: 28, muscleMass: 31, leanMass: 56, visceralFat: 9, basalMetabolicRate: 1520, bodyWaterPercentage: 51, boneMass: 3, metabolicAge: 39, waistCircumference: 88, hipCircumference: 99, chestCircumference: 94, armCircumference: 32, thighCircumference: 54 },
];

describe('buildEvolutionDocDefinition', () => {
  it('draws an svg chart with per-point value labels and keeps each history heading with its table', () => {
    const doc = buildEvolutionDocDefinition({ patientName: 'Ana', height: 170, assessments: rows, branding: { displayName: 'Clínica X', logoDataUrl: null } });
    const nodes = contentArray(doc);
    // The weight chart (80 → 78) is an svg node whose value labels appear as text.
    expect(nodes.some((n) => typeof n.svg === 'string' && n.svg.includes('>80<') && n.svg.includes('>78<'))).toBe(true);
    // Both history sections are unbreakable stacks, each wrapping a table.
    const unbreakables = nodes.filter((n) => n.unbreakable === true);
    expect(unbreakables.length).toBe(2);
    expect(unbreakables.every((s) => Array.isArray(s.stack) && s.stack.some((x: any) => x.table))).toBe(true);
    // brand name present, no image when logo is null
    expect(JSON.stringify(nodes)).toContain('Clínica X');
    expect(nodes.some((n) => Array.isArray(n.columns) && n.columns.some((c: any) => c.image))).toBe(false);
  });

  it('embeds the logo image node only when a data URL is provided', () => {
    const doc = buildEvolutionDocDefinition({ patientName: 'Ana', height: 170, assessments: rows, branding: { displayName: 'X', logoDataUrl: 'data:image/png;base64,AAAA' } });
    const nodes = contentArray(doc);
    expect(nodes.some((n) => Array.isArray(n.columns) && n.columns.some((c: any) => c.image === 'data:image/png;base64,AAAA'))).toBe(true);
  });

  it('shows a "dados insuficientes" note for a metric with fewer than two points', () => {
    const one = [rows[0]];
    const doc = buildEvolutionDocDefinition({ patientName: 'Ana', height: 170, assessments: one, branding: { displayName: 'X', logoDataUrl: null } });
    expect(JSON.stringify(contentArray(doc))).toContain('dados insuficientes');
  });

  it('renders the doc (with svg charts) to a PDF buffer', async () => {
    const doc = buildEvolutionDocDefinition({ patientName: 'Ana', height: 170, assessments: rows, branding: { displayName: 'X', logoDataUrl: null } });
    const buf = await renderPdf(doc);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
