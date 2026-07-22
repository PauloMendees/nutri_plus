// Lowercased, trimmed, diacritic-free form for accent-insensitive matching.
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
