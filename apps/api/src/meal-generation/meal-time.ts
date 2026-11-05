// A IA às vezes devolve o horário como texto ("manhã", "8h"). Só gravamos HH:MM:
// horário legível vira HH:MM, termo comum vira o horário usual da refeição e o
// resto fica vazio, em vez de texto livre no campo que espera um horário.
const TERM_TIMES: readonly [term: string, time: string][] = [
  // Os mais longos primeiro: "lanche da manhã" contém "manhã".
  ['lanche da manha', '10:00'],
  ['lanche da tarde', '15:30'],
  ['cafe da manha', '08:00'],
  ['manha', '08:00'],
  ['almoco', '12:00'],
  ['jantar', '19:30'],
  ['ceia', '21:30'],
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function normalizeMealTime(raw: string | null | undefined): string | null {
  const text = (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (!text) return null;

  const clock = text.match(/^(\d{1,2})\s*(?::|h)\s*(\d{2})?\s*(?:h|min)?$/);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2] ?? '0');
    return hours <= 23 && minutes <= 59 ? `${pad(hours)}:${pad(minutes)}` : null;
  }

  return TERM_TIMES.find(([term]) => text.includes(term))?.[1] ?? null;
}
