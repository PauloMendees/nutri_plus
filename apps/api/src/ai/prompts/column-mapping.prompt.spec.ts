import { IMPORT_FIELDS } from '../../patients/import/import-fields';
import {
  COLUMN_MAPPING_SYSTEM_PROMPT,
  buildColumnMappingUserPrompt,
} from './column-mapping.prompt';

describe('column-mapping prompt', () => {
  it('buildColumnMappingUserPrompt is valid JSON with unmatched and catalog keys', () => {
    const json = buildColumnMappingUserPrompt(['Fone']);
    const parsed = JSON.parse(json);
    expect(parsed.unmatched).toEqual(['Fone']);
    expect(Array.isArray(parsed.catalog)).toBe(true);
    const keys = parsed.catalog.map((entry: { key: string }) => entry.key);
    expect(keys).toEqual(IMPORT_FIELDS.map((field) => field.key));
    expect(json).not.toMatch(/Maria|1199/);
  });

  it('system prompt maps unmatched headers to catalog keys or null without cell values', () => {
    expect(COLUMN_MAPPING_SYSTEM_PROMPT).toMatch(/null/);
    expect(COLUMN_MAPPING_SYSTEM_PROMPT).toMatch(/nunca invente|n[aã]o invente/i);
    expect(COLUMN_MAPPING_SYSTEM_PROMPT).toMatch(/c[eé]lul/i);
  });
});
