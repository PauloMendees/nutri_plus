// Faixa de kcal plausível para um dia inteiro. Fora dela o número fala de uma
// refeição ("lanche com até 200 kcal"), não da meta do plano.
const DAILY_MIN = 800;
const DAILY_MAX = 6000;

// "1.800" é milhar em pt-BR; "1800,5" usa vírgula decimal.
function toNumber(raw: string): number {
  if (/^\d{1,2}\.\d{3}$/.test(raw)) return Number(raw.replace('.', ''));
  return Number(raw.replace(',', '.'));
}

// Lê a meta de kcal escrita nas instruções personalizadas ("~1800 kcal").
// Só kcal: gramas de macro nas instruções costumam ser de um item ("whey com
// 24 g de proteína"), e tomá-las como meta do dia distorceria o plano. Os
// macros saem de targetsForCalories. Com mais de um valor diário (uma faixa),
// fica o maior.
export function caloriesFromInstructions(text: string | null | undefined): number | null {
  const values = [...(text ?? '').matchAll(/(\d[\d.,]*)\s*(?:kcal|calorias)\b/gi)]
    .map((m) => toNumber(m[1]))
    .filter((n) => Number.isFinite(n) && n >= DAILY_MIN && n <= DAILY_MAX);
  return values.length ? Math.round(Math.max(...values)) : null;
}
