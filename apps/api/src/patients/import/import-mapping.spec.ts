import { mapHeadersDeterministic, mapHeadersWithAi, assertMappingUnique } from './import-mapping';

describe('import-mapping', () => {
  it('maps template labels without AI', () => {
    const { suggestedMapping, mappedBy, unmatched } = mapHeadersDeterministic(['Nome', 'E-mail', 'CPF']);
    expect(suggestedMapping['Nome']).toBe('name');
    expect(mappedBy['Nome']).toBe('template');
    expect(suggestedMapping['CPF']).toBe('ignore');
    expect(mappedBy['CPF']).toBe('unmapped');
    expect(unmatched).toEqual(['CPF']);
  });

  it('uses alias before leaving unmatched', () => {
    const { suggestedMapping, mappedBy } = mapHeadersDeterministic(['Nome completo']);
    expect(suggestedMapping['Nome completo']).toBe('name');
    expect(mappedBy['Nome completo']).toBe('alias');
  });

  it('calls AI only with unmatched headers and never cell values', async () => {
    const generateStructured = jest.fn().mockResolvedValue({
      mappings: [{ header: 'Fone do paciente', field: 'phone' }],
    });
    const result = await mapHeadersWithAi(['Nome', 'Fone do paciente'], { generateStructured } as any, 'nut-1');
    expect(generateStructured).toHaveBeenCalledTimes(1);
    const arg = generateStructured.mock.calls[0][0];
    expect(arg.user).not.toMatch(/Maria|1199/);
    expect(arg.user).toContain('Fone do paciente');
    const payload = JSON.parse(arg.user);
    expect(payload.unmatched).toEqual(['Fone do paciente']);
    expect(payload.unmatched).not.toContain('Nome');
    expect(payload.catalog).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'name', label: 'Nome' })]),
    );
    expect(result.suggestedMapping['Fone do paciente']).toBe('phone');
    expect(result.mappedBy['Fone do paciente']).toBe('ai');
  });

  it('treats AI ignore as unmapped', async () => {
    const generateStructured = jest.fn().mockResolvedValue({
      mappings: [{ header: 'CPF', field: 'ignore' }],
    });
    const result = await mapHeadersWithAi(['CPF'], { generateStructured } as any, 'nut-1');
    expect(result.suggestedMapping['CPF']).toBe('ignore');
    expect(result.mappedBy['CPF']).toBe('unmapped');
  });

  it('falls back to dictionary when AI throws', async () => {
    const generateStructured = jest.fn().mockRejectedValue(new Error('down'));
    const result = await mapHeadersWithAi(['Nome', 'CPF'], { generateStructured } as any, 'nut-1');
    expect(result.suggestedMapping['Nome']).toBe('name');
    expect(result.suggestedMapping['CPF']).toBe('ignore');
  });

  it('assertMappingUnique 400 on two columns for name', () => {
    expect(() => assertMappingUnique({ Nome: 'name', Paciente: 'name' })).toThrow();
  });
});
