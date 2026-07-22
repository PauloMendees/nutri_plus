import { normalizeSearch } from './normalize';

describe('normalizeSearch', () => {
  it('lowercases, trims, and strips diacritics', () => {
    expect(normalizeSearch('  Açúcar Mascavo ')).toBe('acucar mascavo');
    expect(normalizeSearch('Pão de Queijo')).toBe('pao de queijo');
    expect(normalizeSearch('ARROZ')).toBe('arroz');
  });
});
