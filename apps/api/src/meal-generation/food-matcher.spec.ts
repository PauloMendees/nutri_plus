import { matchFood } from './food-matcher';

const f = (name: string) => ({ id: name, name, searchName: name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() });

describe('matchFood', () => {
  it('casa por subconjunto de tokens (ignora acentos, vírgulas e ordem)', () => {
    const foods = [f('Arroz, integral, cozido'), f('Feijão, preto, cozido')];
    expect(matchFood('Arroz integral cozido', foods)?.name).toBe('Arroz, integral, cozido');
  });

  it('escolhe o candidato mais específico (menos tokens extras)', () => {
    const foods = [f('Arroz, integral, cozido, com feijão'), f('Arroz, integral, cozido')];
    expect(matchFood('Arroz integral cozido', foods)?.name).toBe('Arroz, integral, cozido');
  });

  it('ignora stopwords do termo da IA', () => {
    const foods = [f('Frango, peito, grelhado')];
    expect(matchFood('Peito de frango grelhado', foods)?.name).toBe('Frango, peito, grelhado');
  });

  it('retorna null quando nenhum alimento contém todas as palavras', () => {
    const foods = [f('Arroz, integral, cozido')];
    expect(matchFood('Pizza congelada', foods)).toBeNull();
  });

  it('NÃO casa uma única palavra comum num nome multi-ingrediente', () => {
    const foods = [f('Frango, peito, grelhado')];
    expect(matchFood('Frango', foods)).toBeNull();
  });

  it('casa uma palavra única só num alimento de nome de 1 palavra', () => {
    const foods = [f('Banana'), f('Frango, peito, grelhado')];
    expect(matchFood('Banana', foods)?.name).toBe('Banana');
  });
});
