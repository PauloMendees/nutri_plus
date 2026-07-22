import { mapTacoRow, normTacoValue } from './taco-mapper';

describe('normTacoValue', () => {
  it('maps Tr→0, NA/*/empty→null, numbers through', () => {
    expect(normTacoValue('Tr')).toBe(0);
    expect(normTacoValue('NA')).toBeNull();
    expect(normTacoValue('*')).toBeNull();
    expect(normTacoValue('')).toBeNull();
    expect(normTacoValue(null)).toBeNull();
    expect(normTacoValue(2.58825)).toBeCloseTo(2.58825, 5);
  });
});

describe('mapTacoRow', () => {
  it('maps a TACO source row to the Food shape', () => {
    const row = {
      id: 1,
      description: 'Arroz, integral, cozido',
      category: 'Cereais e derivados',
      energy_kcal: 123.5,
      protein_g: 2.58,
      carbohydrate_g: 25.8,
      lipid_g: 1.0,
      fiber_g: 2.74,
      sodium_mg: 1.24,
    };
    expect(mapTacoRow(row)).toEqual({
      tacoId: 1,
      name: 'Arroz, integral, cozido',
      group: 'Cereais e derivados',
      searchName: 'arroz, integral, cozido',
      energyKcal: 123.5,
      protein: 2.58,
      carbohydrate: 25.8,
      lipid: 1.0,
      fiber: 2.74,
      sodium: 1.24,
    });
  });
});
