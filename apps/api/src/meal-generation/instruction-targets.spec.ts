import { caloriesFromInstructions } from './instruction-targets';

describe('caloriesFromInstructions', () => {
  it.each([
    ['4 refeições, sem lactose, ~1800 kcal', 1800],
    ['meta de 2.000 kcal por dia', 2000],
    ['dieta de 1500 calorias', 1500],
    ['1650kcal', 1650],
    ['entre 1.900 e 2.100 kcal', 2100],
  ])('lê "%s" como %i kcal', (text, kcal) => {
    expect(caloriesFromInstructions(text)).toBe(kcal);
  });

  it.each([
    [null],
    [''],
    ['apenas 4 refeições'],
    // kcal de uma refeição, não do dia: fora da faixa diária plausível.
    ['lanche da tarde com até 200 kcal'],
    ['incluir whey (~24g proteína) no pós-treino'],
  ])('ignora "%s"', (text) => {
    expect(caloriesFromInstructions(text)).toBeNull();
  });
});
