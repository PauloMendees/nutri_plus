const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// cents (integer) → 'R$ 1.234,56'. Negative cents render with a leading '-'.
export function formatBRL(cents: number): string {
  return BRL.format(cents / 100);
}

// 'R$ 1.234,56' | '1234,56' | '10' → integer cents. NaN when there is no number.
export function parseBRLToCents(input: string): number {
  const cleaned = input
    .replace(/[^\d,.-]/g, '') // drop currency symbol, spaces, letters
    .replace(/\.(?=\d{3}(\D|$))/g, '') // drop thousands dots
    .replace(',', '.'); // decimal comma → dot
  if (cleaned === '' || cleaned === '-') return Number.NaN;
  const reais = Number(cleaned);
  if (Number.isNaN(reais)) return Number.NaN;
  return Math.round(reais * 100);
}
