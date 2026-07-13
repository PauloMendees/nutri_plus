import { buildEvolutionDocDefinition, EvolutionAssessment } from './evolution-doc';

function contentArray(doc: ReturnType<typeof buildEvolutionDocDefinition>): any[] {
  return doc.content as any[];
}

const rows: EvolutionAssessment[] = [
  { assessmentDate: '2026-01-10', weight: 80, bodyFatPercentage: 30, muscleMass: 30, leanMass: 55, visceralFat: 10, basalMetabolicRate: 1500, bodyWaterPercentage: 50, boneMass: 3, metabolicAge: 40, waistCircumference: 90, hipCircumference: 100, chestCircumference: 95, armCircumference: 32, thighCircumference: 55 },
  { assessmentDate: '2026-02-10', weight: 78, bodyFatPercentage: 28, muscleMass: 31, leanMass: 56, visceralFat: 9, basalMetabolicRate: 1520, bodyWaterPercentage: 51, boneMass: 3, metabolicAge: 39, waistCircumference: 88, hipCircumference: 99, chestCircumference: 94, armCircumference: 32, thighCircumference: 54 },
];

describe('buildEvolutionDocDefinition', () => {
  it('draws a chart canvas for a metric with >= 2 points and includes both tables', () => {
    const doc = buildEvolutionDocDefinition({ patientName: 'Ana', height: 170, assessments: rows, branding: { displayName: 'Clínica X', logoDataUrl: null } });
    const nodes = contentArray(doc);
    const canvases = nodes.filter((n) => Array.isArray(n.canvas));
    // header divider + at least the 4 metric charts
    expect(canvases.some((c) => c.canvas.some((s: any) => s.type === 'polyline'))).toBe(true);
    const tables = nodes.filter((n) => n.table);
    expect(tables.length).toBe(2); // composição + circunferências
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
});
