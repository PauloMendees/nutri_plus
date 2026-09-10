// Pure prompt builder for spreadsheet header → catalog-key mapping.
// Receives unmatched headers only — never cell values.

import { IMPORT_FIELDS } from '../../patients/import/import-fields';

export const COLUMN_MAPPING_SYSTEM_PROMPT = [
  'Você mapeia cada cabeçalho não casado (unmatched) para exatamente uma key do catálogo ou null.',
  'Use apenas keys listadas no catálogo — nunca invente keys.',
  'Não peça e não use valores de células; o mapeamento é só pelo nome do cabeçalho.',
].join(' ');

export function buildColumnMappingUserPrompt(unmatched: string[]): string {
  return JSON.stringify({
    unmatched,
    catalog: IMPORT_FIELDS.map(({ key, label, aliases }) => ({ key, label, aliases })),
  });
}
