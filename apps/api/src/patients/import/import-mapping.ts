import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { AIInteractionType } from '../../generated/prisma/client';
import type { OpenAIProvider } from '../../ai/openai.provider';
import {
  COLUMN_MAPPING_SYSTEM_PROMPT,
  buildColumnMappingUserPrompt,
} from '../../ai/prompts/column-mapping.prompt';
import { IMPORT_FIELDS, fieldByNormalizedHeader, normalizeHeader } from './import-fields';

export type MappedBy = 'template' | 'alias' | 'ai' | 'unmapped';

const KNOWN_KEYS = new Set(IMPORT_FIELDS.map((field) => field.key));

export const COLUMN_MAPPING_SCHEMA = z.object({
  mappings: z.array(z.object({
    header: z.string(),
    field: z.string().nullable(),
  })),
});

export function mapHeadersDeterministic(headers: string[]): {
  suggestedMapping: Record<string, string>;
  mappedBy: Record<string, MappedBy>;
  unmatched: string[];
} {
  const suggestedMapping: Record<string, string> = {};
  const mappedBy: Record<string, MappedBy> = {};
  const unmatched: string[] = [];

  for (const header of headers) {
    const field = fieldByNormalizedHeader(header);
    if (!field) {
      suggestedMapping[header] = 'ignore';
      mappedBy[header] = 'unmapped';
      unmatched.push(header);
      continue;
    }
    suggestedMapping[header] = field.key;
    mappedBy[header] =
      normalizeHeader(header) === normalizeHeader(field.label) ? 'template' : 'alias';
  }

  return { suggestedMapping, mappedBy, unmatched };
}

export async function mapHeadersWithAi(
  headers: string[],
  ai: { generateStructured: OpenAIProvider['generateStructured'] },
  nutritionistId: string,
): Promise<{ suggestedMapping: Record<string, string>; mappedBy: Record<string, MappedBy> }> {
  const { suggestedMapping, mappedBy, unmatched } = mapHeadersDeterministic(headers);
  if (unmatched.length === 0) {
    return { suggestedMapping, mappedBy };
  }

  try {
    const result = await ai.generateStructured({
      tier: 'fast',
      type: AIInteractionType.COLUMN_MAPPING,
      schemaName: 'column_mapping',
      nutritionistId,
      schema: COLUMN_MAPPING_SCHEMA,
      system: COLUMN_MAPPING_SYSTEM_PROMPT,
      user: buildColumnMappingUserPrompt(unmatched),
    });
    const unmatchedSet = new Set(unmatched);
    for (const mapping of result.mappings) {
      if (!unmatchedSet.has(mapping.header) || mapping.field == null) continue;
      if (!KNOWN_KEYS.has(mapping.field)) continue;
      suggestedMapping[mapping.header] = mapping.field;
      mappedBy[mapping.header] = 'ai';
    }
  } catch {
    return { suggestedMapping, mappedBy };
  }

  return { suggestedMapping, mappedBy };
}

export function assertMappingUnique(mapping: Record<string, string>): void {
  const seen = new Set<string>();
  for (const field of Object.values(mapping)) {
    if (field === 'ignore') continue;
    if (seen.has(field)) {
      throw new BadRequestException(`campo ${field} mapeado duas vezes`);
    }
    seen.add(field);
  }
}
