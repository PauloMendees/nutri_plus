/** Calendar day of an ISO timestamp in UTC — Asaas date-only fields are midnight UTC. */
export function formatIsoDateUtc(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
