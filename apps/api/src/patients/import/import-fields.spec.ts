import { IMPORT_FIELDS, fieldByNormalizedHeader, normalizeHeader } from './import-fields';

describe('import-fields', () => {
  it('maps Nome completo via alias', () => {
    expect(fieldByNormalizedHeader('Nome completo')?.key).toBe('name');
  });

  it('maps E-mail despite accent/case', () => {
    expect(fieldByNormalizedHeader('E-MAIL')?.key).toBe('email');
  });

  it('unknown header is undefined', () => {
    expect(fieldByNormalizedHeader('CPF')).toBeUndefined();
  });

  it('normalizeHeader strips accents and lowercases', () => {
    expect(normalizeHeader('  E-Mail  ')).toBe('e-mail');
    expect(normalizeHeader('Observações')).toBe('observacoes');
  });

  it('every IMPORT_FIELDS label maps to its key', () => {
    for (const field of IMPORT_FIELDS) {
      expect(fieldByNormalizedHeader(field.label)?.key).toBe(field.key);
    }
  });

  it('maps assessment aliases Peso / Weight / %GC / CC / CQ', () => {
    expect(fieldByNormalizedHeader('Peso')?.key).toBe('assessment.weight');
    expect(fieldByNormalizedHeader('Weight')?.key).toBe('assessment.weight');
    expect(fieldByNormalizedHeader('%GC')?.key).toBe('assessment.bodyFatPercentage');
    expect(fieldByNormalizedHeader('CC')?.key).toBe('assessment.waistCircumference');
    expect(fieldByNormalizedHeader('CQ')?.key).toBe('assessment.hipCircumference');
  });
});
