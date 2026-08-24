/** Local YYYY-MM-DD for <input type="date">; toISOString drifts to the UTC
 * calendar day (after ~21:00 in America/Sao_Paulo it lands on "tomorrow"). */
export function localDateInput(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
