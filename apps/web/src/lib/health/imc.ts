// WHO BMI categories (pt-BR). Lower bounds are inclusive.
export function imcCategory(imc: number | null): string | null {
  if (imc == null) return null;
  if (imc < 18.5) return 'Abaixo do peso';
  if (imc < 25) return 'Peso normal';
  if (imc < 30) return 'Sobrepeso';
  return 'Obesidade';
}

// Classify the exact value. Show 1 decimal unless that rounding would change the band.
export function formatImc(imc: number | null): string {
  if (imc == null) return '—';
  const rounded1 = Math.round(imc * 10) / 10;
  const display =
    imcCategory(rounded1) === imcCategory(imc)
      ? rounded1.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : imc.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${display} · ${imcCategory(imc)}`;
}

// EXPERIMENTAL (see spec §3): the real value in kg represented by a percentage
// of body weight. May change or be removed.
export function kgFromPercent(weightKg: number | null, pct: number | null): number | null {
  if (weightKg == null || pct == null) return null;
  return Math.round((weightKg * pct) / 100 * 10) / 10;
}
