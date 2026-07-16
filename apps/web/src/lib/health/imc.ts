// WHO BMI categories (pt-BR). Lower bounds are inclusive.
export function imcCategory(imc: number | null): string | null {
  if (imc == null) return null;
  if (imc < 18.5) return 'Abaixo do peso';
  if (imc < 25) return 'Peso normal';
  if (imc < 30) return 'Sobrepeso';
  return 'Obesidade';
}

// "24,2 · Peso normal", or "—" when unavailable.
export function formatImc(imc: number | null): string {
  if (imc == null) return '—';
  return `${imc.toLocaleString('pt-BR')} · ${imcCategory(imc)}`;
}
