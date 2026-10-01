import { buildNutritionistsReportDoc, describeFilters } from './admin-report-doc';
import { renderPdf } from '../meal-plans/pdf/pdf-printer';

const row = {
  id: 'n1', name: 'Ana Souza', email: 'ana@x.com', phone: '5511999998888', confirmed: true,
  patientCount: 3, plan: 'PRO' as const, createdAt: '2026-09-10T15:00:00.000Z',
};

describe('describeFilters', () => {
  it('says "Sem filtros" when nothing is set', () => expect(describeFilters({})).toBe('Sem filtros'));
  it('lists the active filters in Portuguese', () => {
    expect(
      describeFilters({ search: 'ana', confirmed: 'no', plan: 'TRIAL', createdFrom: '2026-09-01', createdTo: '2026-09-30' }),
    ).toBe('Busca: "ana" · Confirmou: Não · Plano: Teste grátis · Cadastro: de 01/09/2026 até 30/09/2026');
  });
});

describe('buildNutritionistsReportDoc', () => {
  const doc = buildNutritionistsReportDoc({ rows: [row], filters: { plan: 'PRO' }, generatedAt: new Date('2026-10-01T15:00:00Z') });
  const json = JSON.stringify(doc);

  it('is A4 landscape with title, filters, total and the table', () => {
    expect(doc.pageSize).toBe('A4');
    expect(doc.pageOrientation).toBe('landscape');
    expect(json).toContain('Nutricionistas — iNutri');
    expect(json).toContain('Plano: Pro');
    expect(json).toContain('1 nutricionista');
    for (const h of ['Nome', 'E-mail', 'Telefone', 'Confirmou', 'Pacientes', 'Plano', 'Cadastro']) expect(json).toContain(h);
    expect(json).toContain('Ana Souza');
    expect(json).toContain('10/09/2026');
  });

  it('renders a valid PDF even with no rows', async () => {
    const empty = buildNutritionistsReportDoc({ rows: [], filters: {}, generatedAt: new Date() });
    expect(JSON.stringify(empty)).toContain('Nenhuma nutricionista encontrada.');
    const buf = await renderPdf(empty);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('ends with a legend explaining every plan status and the confirmation column', () => {
    const json = JSON.stringify(buildNutritionistsReportDoc({ rows: [row], filters: {}, generatedAt: new Date() }));
    expect(json).toContain('Legenda dos status');
    for (const label of ['Cortesia', 'Pro', 'Essencial', 'Teste grátis', 'Teste encerrado', 'Vencida', 'Sem plano']) {
      expect(json).toContain(label);
    }
    expect(json).toContain('usou o teste grátis e não assinou');
    expect(json).toContain('já foi assinante');
    expect(json).toContain('Confirmou: Não');
    // A legenda vem depois da tabela.
    expect(json.indexOf('Legenda dos status')).toBeGreaterThan(json.indexOf('Ana Souza'));
  });

  it('shows the legend even when there are no rows', () => {
    const json = JSON.stringify(buildNutritionistsReportDoc({ rows: [], filters: {}, generatedAt: new Date() }));
    expect(json).toContain('Legenda dos status');
  });
});
