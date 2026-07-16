import { buildEvolutionDocDefinition, EvolutionAssessment } from './evolution-doc';
import { renderPdf } from '../../meal-plans/pdf/pdf-printer';

function contentArray(doc: ReturnType<typeof buildEvolutionDocDefinition>): any[] {
  return doc.content as any[];
}

const rows: EvolutionAssessment[] = [
  { assessmentDate: '2026-01-10', weight: 80, bodyFatPercentage: 30, muscleMass: 30, leanMass: 55, muscleMassPercentage: 40, leanMassPercentage: 55, visceralFat: 10, basalMetabolicRate: 1500, bodyWaterPercentage: 50, boneMass: 3, metabolicAge: 40, waistCircumference: 90, hipCircumference: 100, chestCircumference: 95, armCircumference: 32, thighCircumference: 55, abdomenCircumference: 85, contractedArmCircumference: 34, calfCircumference: 38 },
  { assessmentDate: '2026-02-10', weight: 78, bodyFatPercentage: 28, muscleMass: 31, leanMass: 56, muscleMassPercentage: 41, leanMassPercentage: 56, visceralFat: 9, basalMetabolicRate: 1520, bodyWaterPercentage: 51, boneMass: 3, metabolicAge: 39, waistCircumference: 88, hipCircumference: 99, chestCircumference: 94, armCircumference: 32, thighCircumference: 54, abdomenCircumference: 83, contractedArmCircumference: 35, calfCircumference: 37 },
];

describe('buildEvolutionDocDefinition', () => {
  it('draws an svg chart with per-point value labels and keeps each history heading with its table', () => {
    const doc = buildEvolutionDocDefinition({ patientName: 'Ana', height: 170, assessments: rows, branding: { displayName: 'Clínica X', logoDataUrl: null } });
    const nodes = contentArray(doc);
    // The weight chart (80 → 78) is an svg node whose value labels appear as text.
    expect(nodes.some((n) => typeof n.svg === 'string' && n.svg.includes('>80<') && n.svg.includes('>78<'))).toBe(true);
    // Both history tables are top-level nodes (NOT wrapped in an unbreakable
    // block, which pdfmake drops when taller than a page); their headings are
    // headlineLevel-tagged for the orphan-avoiding pageBreakBefore.
    const tables = nodes.filter((n) => n.table);
    expect(tables.length).toBe(2);
    expect(nodes.filter((n) => n.headlineLevel === 1).length).toBeGreaterThanOrEqual(2);
    expect(typeof doc.pageBreakBefore).toBe('function');
    // brand name present, no image when logo is null
    expect(JSON.stringify(nodes)).toContain('Clínica X');
    expect(nodes.some((n) => Array.isArray(n.columns) && n.columns.some((c: any) => c.image))).toBe(false);
    // circumference table now includes the Abdômen column
    expect(JSON.stringify(nodes)).toContain('Abdômen');
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

  it('breaks before a section heading only when it would orphan at the page bottom', () => {
    const doc = buildEvolutionDocDefinition({ patientName: 'Ana', height: 170, assessments: rows, branding: { displayName: 'X', logoDataUrl: null } });
    const pbb = doc.pageBreakBefore as (n: any, following: any[]) => boolean;
    expect(pbb({ headlineLevel: 1 }, [])).toBe(true);        // heading is last on page → break
    expect(pbb({ headlineLevel: 1 }, [{}])).toBe(false);     // content follows → keep
    expect(pbb({}, [])).toBe(false);                          // non-heading → never force-break
  });
});
