// Campos só-data (assessmentDate, recallDate) são gravados como meia-noite UTC
// do dia escolhido — é o que `new Date('2026-09-29')` produz a partir do input.
// Um instante (ex.: scanDate = now()) precisa virar esse mesmo formato usando o
// dia de São Paulo, ou uma medição feita depois das 21h cairia no dia seguinte.
export function saoPauloCalendarDate(instant: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}
