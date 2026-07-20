import { normalizeSearch } from '../foods/normalize';

// Conectivos pt-BR ignorados no casamento (não são "palavras de conteúdo").
const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'e', 'em', 'no', 'na', 'ao', 'a', 'o',
]);

function tokens(s: string): string[] {
  return normalizeSearch(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function contentTokens(s: string): string[] {
  return tokens(s).filter((t) => !STOPWORDS.has(t));
}

// Casa o nome livre da IA a um Food por SUBCONJUNTO de tokens: todas as palavras de
// conteúdo do termo aparecem nos tokens do searchName do Food. Escolhe o mais
// específico (menos tokens no total; desempate por nome). Alta confiança: um termo
// de 1 palavra só casa um alimento cujo conteúdo seja exatamente aquela palavra —
// evita "Frango" casar "Frango, peito, grelhado". Sem candidato → null.
export function matchFood<T extends { name: string; searchName: string }>(
  foodName: string,
  foods: T[],
): T | null {
  const query = contentTokens(foodName);
  if (query.length === 0) return null;
  const single = query.length === 1;

  let best: T | null = null;
  let bestSize = Infinity;
  for (const food of foods) {
    const fset = new Set(tokens(food.searchName));
    if (!query.every((t) => fset.has(t))) continue;
    if (single) {
      const fcontent = contentTokens(food.searchName);
      if (!(fcontent.length === 1 && fcontent[0] === query[0])) continue;
    }
    const size = fset.size;
    if (size < bestSize || (size === bestSize && best !== null && food.name < best.name)) {
      best = food;
      bestSize = size;
    }
  }
  return best;
}
