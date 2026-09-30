/**
 * Calendar day of an ISO timestamp in UTC. Date-only fields (Asaas dates,
 * assessmentDate, recallDate) are stored as midnight UTC; formatting them in
 * the browser's zone shows the day before in Brazil (UTC-3).
 */
export function formatIsoDateUtc(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

/** Short dd/mm of a date-only field, in UTC — same reasoning as formatIsoDateUtc. */
export function formatIsoDayMonthUtc(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}
