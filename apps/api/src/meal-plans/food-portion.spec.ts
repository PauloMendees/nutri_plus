import { macrosForPortion } from '@nutri-plus/shared-types';

describe('macrosForPortion', () => {
  const arrozIntegral = {
    energyKcal: 124,
    protein: 2.6,
    carbohydrate: 25.8,
    lipid: 1,
    fiber: 2.7,
    sodium: 1.2,
  };

  it('escala os nutrientes por 100 g e arredonda para inteiro', () => {
    expect(macrosForPortion(arrozIntegral, 150)).toEqual({
      calories: 186, // 124 * 1.5
      protein: 4, //   2.6 * 1.5 = 3.9 -> 4
      carbs: 39, //    25.8 * 1.5 = 38.7 -> 39
      fats: 2, //      1 * 1.5 = 1.5 -> 2
      fiber: 4, //     2.7 * 1.5 = 4.05 -> 4
      sodium: 2, //    1.2 * 1.5 = 1.8 -> 2
    });
  });

  it('trata nutriente null como 0', () => {
    expect(
      macrosForPortion(
        { energyKcal: 100, protein: null, carbohydrate: null, lipid: null, fiber: null, sodium: null },
        200,
      ),
    ).toEqual({ calories: 200, protein: 0, carbs: 0, fats: 0, fiber: 0, sodium: 0 });
  });

  it('retorna tudo 0 para 0 g', () => {
    expect(macrosForPortion(arrozIntegral, 0)).toEqual({
      calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sodium: 0,
    });
  });
});
