import { ZodType } from 'zod';
import { AIInteractionType } from '../../generated/prisma/client';

// Consumers ask for a capability tier, never a literal model name. Tiers map to
// env-configured models (OPENAI_MODEL_SMART / OPENAI_MODEL_FAST).
export type ModelTier = 'smart' | 'fast';

export interface GenerateStructuredOptions<T> {
  tier: ModelTier;
  system: string;
  // The user prompt — structured context, JSON-stringified by the consumer.
  user: string;
  schema: ZodType<T>;
  // Name for OpenAI's json_schema response_format (e.g. 'meal_plan').
  schemaName: string;
  type: AIInteractionType;
  patientId?: string;
}
