import { normalizeMealTime } from './meal-time';

describe('normalizeMealTime', () => {
  it.each([
    ['08:00', '08:00'],
    ['8:00', '08:00'],
    ['8h', '08:00'],
    ['08h30', '08:30'],
    ['8h30min', '08:30'],
    [' 12:30 ', '12:30'],
    ['19:30h', '19:30'],
  ])('aceita horário "%s" como %s', (input, expected) => {
    expect(normalizeMealTime(input)).toBe(expected);
  });

  it.each([
    ['manhã', '08:00'],
    ['Café da manhã', '08:00'],
    ['lanche da manhã', '10:00'],
    ['Almoço', '12:00'],
    ['LANCHE DA TARDE', '15:30'],
    ['jantar', '19:30'],
    ['Ceia', '21:30'],
  ])('mapeia o termo "%s" para %s', (input, expected) => {
    expect(normalizeMealTime(input)).toBe(expected);
  });

  it.each([null, undefined, '', 'tarde', 'quando quiser', '25:00', '08:75'])(
    'devolve null para "%s"',
    (input) => {
      expect(normalizeMealTime(input)).toBeNull();
    },
  );
});
