# AI Architecture (Step 05) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A centralized AI module (`apps/api/src/ai/`) — one `OpenAIProvider.generateStructured<T>()` gateway with structured-only output, Zod validation, per-call audit rows (`AIInteraction`), token/latency/cost logging, and env-configurable model tiers. Infrastructure only; no endpoints.

**Architecture:** Concrete `OpenAIProvider` wraps the official `openai` SDK (no vendor abstraction). Consumers pass a tier (`'smart' | 'fast'`), prompts, and a Zod schema; the provider calls OpenAI with native structured outputs (`zodResponseFormat`), re-validates with Zod, computes cost from a pricing map, and persists an `AIInteraction` audit row on success AND failure via a never-throwing `AiInteractionsService`. Errors map to Nest exceptions (`BadGatewayException`), mirroring `SupabaseAdminService`.

**Tech Stack:** NestJS 10.4, Prisma 7.8, `openai` SDK (+ `openai/helpers/zod`), Zod 3, Jest + `jest-mock-extended`.

---

## Conventions for every task

- **All shell commands must be prefixed with `export PATH="$HOME/.local/bin:$PATH"`** (`pnpm` lives at `~/.local/bin/pnpm`).
- Run from the repo root unless a step says otherwise.
- Unit tests: `pnpm --filter @nutri-plus/api test -- <pattern>`
- E2E tests: `pnpm --filter @nutri-plus/api test:e2e` (needs local `nutri_plus_test` Postgres).
- 2-space indent, single quotes (repo style).
- Prisma client delegate for model `AIInteraction` is `prisma.aIInteraction` (Prisma lower-cases only the first letter).

## File Structure

**Create:**
- `apps/api/src/ai/types/ai.types.ts` — `ModelTier`, `GenerateStructuredOptions<T>`
- `apps/api/src/ai/pricing.ts` — per-model pricing map + `estimateCostUsd`
- `apps/api/src/ai/pricing.spec.ts`
- `apps/api/src/ai/ai-interactions.service.ts` — never-throwing audit writer
- `apps/api/src/ai/ai-interactions.service.spec.ts`
- `apps/api/src/ai/openai.provider.ts` — the single OpenAI gateway
- `apps/api/src/ai/openai.provider.spec.ts`
- `apps/api/src/ai/ai.module.ts`
- `apps/api/src/ai/prompts/.gitkeep` — placeholder dir; Steps 06/08 add prompt builders here

**Modify:**
- `apps/api/prisma/schema.prisma` — `AIInteractionType` enum, `AIInteraction` model, back-relation on `PatientProfile`
- `apps/api/src/config/env.schema.ts` — `OPENAI_MODEL_SMART`/`OPENAI_MODEL_FAST` with defaults
- `apps/api/src/config/env.schema.spec.ts` — defaults test
- `apps/api/src/app.module.ts` — register `AiModule`
- `apps/api/package.json` — add `openai` dependency

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the back-relation to `PatientProfile`**

In `model PatientProfile`, right after the `mealPlans MealPlan[]` line, add:

```prisma
  aiInteractions AIInteraction[]
```

- [ ] **Step 2: Append the enum + model at the END of the schema**

```prisma
enum AIInteractionType {
  MEAL_PLAN_GENERATION
  OUTSIDE_HOME_SUGGESTION
}

// Audit trail for every AI call, successful or failed. The patient FK uses the
// default ON DELETE RESTRICT intentionally (same reasoning as BodyAssessment):
// audit rows must never cascade away. patientId is nullable because future
// interaction types may not be patient-scoped.
model AIInteraction {
  id        String   @id @default(uuid())
  patientId String?
  patient   PatientProfile? @relation(fields: [patientId], references: [id])
  type      AIInteractionType
  model     String           // literal model used (e.g. "gpt-4o-mini")
  input     Json             // prompt/context sent
  response  Json?            // null when the call failed
  promptTokens     Int?
  completionTokens Int?
  latencyMs        Int?
  estimatedCostUsd Float?
  success      Boolean
  errorMessage String?
  createdAt    DateTime @default(now())

  @@index([patientId, createdAt])
  @@index([type, createdAt])
}
```

- [ ] **Step 3: Create and apply the migration**

```bash
export PATH="$HOME/.local/bin:$PATH"
cd apps/api && pnpm exec prisma migrate dev --name add_ai_interaction
```

Expected: new folder `apps/api/prisma/migrations/<timestamp>_add_ai_interaction/` with SQL creating the `AIInteractionType` enum and `AIInteraction` table (FK `ON DELETE RESTRICT`); output ends "Your database is now in sync with your schema". If migrate reports drift or asks to reset, STOP and report BLOCKED — do not reset any database.

- [ ] **Step 4: Build to confirm the generated client has the new delegate**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add AIInteraction audit model"
```

---

## Task 2: Env schema — model tiers (TDD)

**Files:**
- Modify: `apps/api/src/config/env.schema.spec.ts`
- Modify: `apps/api/src/config/env.schema.ts`

- [ ] **Step 1: Add the failing test**

In `apps/api/src/config/env.schema.spec.ts`, add inside the existing `describe('validateEnv', ...)` block:

```ts
  it('applies model-tier defaults when the vars are omitted', () => {
    const result = validateEnv(valid);
    expect(result.OPENAI_MODEL_SMART).toBe('gpt-4o');
    expect(result.OPENAI_MODEL_FAST).toBe('gpt-4o-mini');
  });

  it('uses explicit model-tier values when provided', () => {
    const result = validateEnv({ ...valid, OPENAI_MODEL_FAST: 'gpt-5-mini' });
    expect(result.OPENAI_MODEL_FAST).toBe('gpt-5-mini');
  });
```

- [ ] **Step 2: Run to verify failure**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- env.schema
```

Expected: FAIL — `OPENAI_MODEL_SMART` does not exist on the result type / is `undefined`.

- [ ] **Step 3: Implement**

In `apps/api/src/config/env.schema.ts`, add to `envSchema` right after the `OPENAI_API_KEY` line:

```ts
  OPENAI_MODEL_SMART: z.string().min(1).default('gpt-4o'),
  OPENAI_MODEL_FAST: z.string().min(1).default('gpt-4o-mini'),
```

- [ ] **Step 4: Run to verify pass**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- env.schema
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.schema.ts apps/api/src/config/env.schema.spec.ts
git commit -m "feat(api): env-configurable AI model tiers with defaults"
```

---

## Task 3: openai dependency + types + pricing (TDD)

**Files:**
- Modify: `apps/api/package.json` (via pnpm add)
- Create: `apps/api/src/ai/types/ai.types.ts`
- Create: `apps/api/src/ai/pricing.spec.ts`
- Create: `apps/api/src/ai/pricing.ts`
- Create: `apps/api/src/ai/prompts/.gitkeep`

- [ ] **Step 1: Install the SDK**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api add openai
```

Then verify the Zod helper resolves:

```bash
cd apps/api && node -e "if (!require('openai/helpers/zod').zodResponseFormat) process.exit(1)" && echo OK
```

Expected: `OK`. If the installed major has dropped Zod 3 support (import/type errors later in Task 5), pin instead: `pnpm --filter @nutri-plus/api add openai@^5` and repeat the check.

- [ ] **Step 2: Create the types file**

Create `apps/api/src/ai/types/ai.types.ts`:

```ts
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
```

- [ ] **Step 3: Write the failing pricing test**

Create `apps/api/src/ai/pricing.spec.ts`:

```ts
import { estimateCostUsd } from './pricing';

describe('estimateCostUsd', () => {
  it('computes prompt + completion cost for a known model', () => {
    // gpt-4o-mini: $0.15/M input, $0.60/M output
    const cost = estimateCostUsd('gpt-4o-mini', 1000, 2000);
    expect(cost).toBeCloseTo((1000 * 0.15 + 2000 * 0.6) / 1_000_000, 10);
  });

  it('returns null for an unknown model', () => {
    expect(estimateCostUsd('gpt-future', 1000, 2000)).toBeNull();
  });

  it('returns null when token counts are missing', () => {
    expect(estimateCostUsd('gpt-4o', undefined, 2000)).toBeNull();
    expect(estimateCostUsd('gpt-4o', 1000, undefined)).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify failure**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- pricing
```

Expected: FAIL — `Cannot find module './pricing'`.

- [ ] **Step 5: Implement pricing**

Create `apps/api/src/ai/pricing.ts`:

```ts
// USD per 1M tokens. Update alongside model/price changes; an unknown model
// yields a null estimate rather than a wrong one.
const PRICING_PER_MTOKEN_USD: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

export function estimateCostUsd(
  model: string,
  promptTokens?: number,
  completionTokens?: number,
): number | null {
  const pricing = PRICING_PER_MTOKEN_USD[model];
  if (!pricing || promptTokens === undefined || completionTokens === undefined) {
    return null;
  }
  return (
    (promptTokens * pricing.input + completionTokens * pricing.output) /
    1_000_000
  );
}
```

- [ ] **Step 6: Run to verify pass**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- pricing
```

Expected: PASS (3 tests).

- [ ] **Step 7: Add the prompts placeholder and commit**

```bash
mkdir -p apps/api/src/ai/prompts && touch apps/api/src/ai/prompts/.gitkeep
git add apps/api/package.json pnpm-lock.yaml apps/api/src/ai
git commit -m "feat(api): openai dep, AI types, model pricing"
```

---

## Task 4: AiInteractionsService (TDD)

**Files:**
- Create: `apps/api/src/ai/ai-interactions.service.spec.ts`
- Create: `apps/api/src/ai/ai-interactions.service.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/ai/ai-interactions.service.spec.ts`:

```ts
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { AiInteractionsService } from './ai-interactions.service';
import { AIInteractionType } from '../generated/prisma/client';

describe('AiInteractionsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: AiInteractionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new AiInteractionsService(prisma);
  });

  it('persists a successful interaction with the full audit shape', async () => {
    prisma.aIInteraction.create.mockResolvedValue({ id: 'i1' } as any);

    await service.record({
      type: AIInteractionType.MEAL_PLAN_GENERATION,
      model: 'gpt-4o',
      input: { system: 'sys', user: 'usr' },
      response: { title: 'Plan' },
      promptTokens: 100,
      completionTokens: 50,
      latencyMs: 1200,
      estimatedCostUsd: 0.00075,
      success: true,
      patientId: 'p1',
    });

    expect(prisma.aIInteraction.create).toHaveBeenCalledWith({
      data: {
        type: AIInteractionType.MEAL_PLAN_GENERATION,
        model: 'gpt-4o',
        input: { system: 'sys', user: 'usr' },
        response: { title: 'Plan' },
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 1200,
        estimatedCostUsd: 0.00075,
        success: true,
        errorMessage: undefined,
        patientId: 'p1',
      },
    });
  });

  it('persists a failed interaction with a null response', async () => {
    prisma.aIInteraction.create.mockResolvedValue({ id: 'i2' } as any);

    await service.record({
      type: AIInteractionType.MEAL_PLAN_GENERATION,
      model: 'gpt-4o',
      input: { system: 'sys', user: 'usr' },
      success: false,
      errorMessage: 'boom',
    });

    expect(prisma.aIInteraction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        success: false,
        errorMessage: 'boom',
        response: undefined,
      }),
    });
  });

  it('never throws when the audit write fails (logs instead)', async () => {
    prisma.aIInteraction.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.record({
        type: AIInteractionType.MEAL_PLAN_GENERATION,
        model: 'gpt-4o',
        input: { system: 'sys', user: 'usr' },
        success: true,
      }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- ai-interactions
```

Expected: FAIL — `Cannot find module './ai-interactions.service'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/ai/ai-interactions.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIInteractionType, Prisma } from '../generated/prisma/client';

export interface RecordInteractionInput {
  type: AIInteractionType;
  model: string;
  input: { system: string; user: string };
  response?: unknown;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  estimatedCostUsd?: number | null;
  success: boolean;
  errorMessage?: string;
  patientId?: string;
}

@Injectable()
export class AiInteractionsService {
  private readonly logger = new Logger(AiInteractionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Never throws: an audit failure must not mask the AI result it documents
  // (same contract as SupabaseAdminService.deleteUser).
  async record(data: RecordInteractionInput): Promise<void> {
    try {
      await this.prisma.aIInteraction.create({
        data: {
          type: data.type,
          model: data.model,
          input: data.input as unknown as Prisma.InputJsonValue,
          response:
            data.response === undefined
              ? undefined
              : (data.response as Prisma.InputJsonValue),
          promptTokens: data.promptTokens,
          completionTokens: data.completionTokens,
          latencyMs: data.latencyMs,
          estimatedCostUsd: data.estimatedCostUsd,
          success: data.success,
          errorMessage: data.errorMessage,
          patientId: data.patientId,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist AIInteraction (type=${data.type})`,
        error as Error,
      );
    }
  }
}
```

If `Prisma.InputJsonValue` is not exported by the generated client, use `Prisma.JsonObject` or fall back to `as object` — check `apps/api/src/generated/prisma/client.ts` exports and keep the cast minimal.

- [ ] **Step 4: Run to verify pass**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- ai-interactions
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/ai-interactions.service.ts apps/api/src/ai/ai-interactions.service.spec.ts
git commit -m "feat(api): AiInteractionsService audit writer"
```

---

## Task 5: OpenAIProvider (TDD)

**Files:**
- Create: `apps/api/src/ai/openai.provider.spec.ts`
- Create: `apps/api/src/ai/openai.provider.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/ai/openai.provider.spec.ts`:

```ts
import { BadGatewayException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { z } from 'zod';
import { OpenAIProvider } from './openai.provider';
import { AiInteractionsService } from './ai-interactions.service';
import { AIInteractionType } from '../generated/prisma/client';

const ENV: Record<string, string> = {
  OPENAI_API_KEY: 'sk-test',
  OPENAI_MODEL_SMART: 'gpt-4o',
  OPENAI_MODEL_FAST: 'gpt-4o-mini',
};

const schema = z.object({ title: z.string() });

function makeProvider(env: Record<string, string> = ENV) {
  const config = {
    getOrThrow: (key: string) => {
      if (env[key] === undefined) throw new Error(`missing ${key}`);
      return env[key];
    },
  } as any;
  const interactions = mockDeep<AiInteractionsService>();
  const provider = new OpenAIProvider(config, interactions);
  const create = jest.fn();
  (provider as any).client = { chat: { completions: { create } } };
  return { provider, interactions, create };
}

function completion(content: string | null, refusal: string | null = null) {
  return {
    choices: [{ message: { content, refusal } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

const baseOpts = {
  tier: 'smart' as const,
  system: 'You are a nutrition assistant.',
  user: '{"objective":"WEIGHT_LOSS"}',
  schema,
  schemaName: 'test_schema',
  type: AIInteractionType.MEAL_PLAN_GENERATION,
  patientId: 'p1',
};

describe('OpenAIProvider.generateStructured', () => {
  it('returns the parsed object and records a successful interaction', async () => {
    const { provider, interactions, create } = makeProvider();
    create.mockResolvedValue(completion(JSON.stringify({ title: 'Plan' })));

    const result = await provider.generateStructured(baseOpts);

    expect(result).toEqual({ title: 'Plan' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: baseOpts.system },
          { role: 'user', content: baseOpts.user },
        ],
        response_format: expect.anything(),
      }),
    );
    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AIInteractionType.MEAL_PLAN_GENERATION,
        model: 'gpt-4o',
        input: { system: baseOpts.system, user: baseOpts.user },
        response: { title: 'Plan' },
        promptTokens: 100,
        completionTokens: 50,
        // gpt-4o: (100 * 2.5 + 50 * 10) / 1e6
        estimatedCostUsd: expect.closeTo(0.00075, 10),
        success: true,
        patientId: 'p1',
      }),
    );
  });

  it('resolves the fast tier to the configured fast model', async () => {
    const { provider, create } = makeProvider();
    create.mockResolvedValue(completion(JSON.stringify({ title: 'x' })));

    await provider.generateStructured({ ...baseOpts, tier: 'fast' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o-mini' }),
    );
  });

  it('records a null cost for an unknown model', async () => {
    const { provider, interactions, create } = makeProvider({
      ...ENV,
      OPENAI_MODEL_SMART: 'gpt-future',
    });
    create.mockResolvedValue(completion(JSON.stringify({ title: 'x' })));

    await provider.generateStructured(baseOpts);

    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-future', estimatedCostUsd: null }),
    );
  });

  it('maps an SDK failure to BadGateway and records the failed call', async () => {
    const { provider, interactions, create } = makeProvider();
    create.mockRejectedValue(new Error('network'));

    await expect(provider.generateStructured(baseOpts)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: 'OpenAI request failed',
      }),
    );
  });

  it('maps unparsable JSON content to BadGateway and records the payload', async () => {
    const { provider, interactions, create } = makeProvider();
    create.mockResolvedValue(completion('not-json'));

    await expect(provider.generateStructured(baseOpts)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: expect.stringContaining('Unparsable JSON'),
      }),
    );
  });

  it('maps a schema-invalid response to BadGateway and records the payload', async () => {
    const { provider, interactions, create } = makeProvider();
    create.mockResolvedValue(completion(JSON.stringify({ wrong: 1 })));

    await expect(provider.generateStructured(baseOpts)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: expect.stringContaining('Schema validation failed'),
      }),
    );
  });

  it('maps a refusal to BadGateway and records it', async () => {
    const { provider, interactions, create } = makeProvider();
    create.mockResolvedValue(completion(null, 'I cannot help with that'));

    await expect(provider.generateStructured(baseOpts)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: expect.stringContaining('Refusal'),
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- openai.provider
```

Expected: FAIL — `Cannot find module './openai.provider'`.

- [ ] **Step 3: Implement the provider**

Create `apps/api/src/ai/openai.provider.ts`:

```ts
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { AiInteractionsService } from './ai-interactions.service';
import { estimateCostUsd } from './pricing';
import { GenerateStructuredOptions, ModelTier } from './types/ai.types';

// Keep stored error payloads bounded; full content is never logged (PII).
function truncate(s: string, max = 500): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// The single gateway to OpenAI. Nothing else in the codebase may import the
// SDK: controllers and feature services call generateStructured. The provider
// is mechanism-only — it knows nothing about macros/BMI/TDEE; all critical
// calculations happen in backend services before the prompt is built.
@Injectable()
export class OpenAIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly client: OpenAI;
  private readonly models: Record<ModelTier, string>;

  constructor(
    config: ConfigService,
    private readonly interactions: AiInteractionsService,
  ) {
    this.client = new OpenAI({
      apiKey: config.getOrThrow<string>('OPENAI_API_KEY'),
    });
    this.models = {
      smart: config.getOrThrow<string>('OPENAI_MODEL_SMART'),
      fast: config.getOrThrow<string>('OPENAI_MODEL_FAST'),
    };
  }

  async generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<T> {
    const model = this.models[opts.tier];
    const input = { system: opts.system, user: opts.user };
    const startedAt = Date.now();

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        response_format: zodResponseFormat(opts.schema, opts.schemaName),
      });
    } catch {
      await this.interactions.record({
        type: opts.type,
        model,
        input,
        latencyMs: Date.now() - startedAt,
        success: false,
        errorMessage: 'OpenAI request failed',
        patientId: opts.patientId,
      });
      this.logger.warn(`OpenAI request failed (type=${opts.type}, model=${model})`);
      throw new BadGatewayException('AI provider unavailable');
    }

    const latencyMs = Date.now() - startedAt;
    const promptTokens = completion.usage?.prompt_tokens;
    const completionTokens = completion.usage?.completion_tokens;
    const common = {
      type: opts.type,
      model,
      input,
      promptTokens,
      completionTokens,
      latencyMs,
      estimatedCostUsd: estimateCostUsd(model, promptTokens, completionTokens),
      patientId: opts.patientId,
    };

    const reject = async (errorMessage: string): Promise<never> => {
      await this.interactions.record({ ...common, success: false, errorMessage });
      this.logger.warn(`AI response invalid (type=${opts.type}, model=${model})`);
      throw new BadGatewayException('AI returned an invalid response');
    };

    const message = completion.choices[0]?.message;
    if (!message?.content || message.refusal) {
      return reject(
        message?.refusal
          ? `Refusal: ${truncate(message.refusal)}`
          : 'Empty response content',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message.content);
    } catch {
      return reject(`Unparsable JSON: ${truncate(message.content)}`);
    }

    const result = opts.schema.safeParse(parsed);
    if (!result.success) {
      return reject(
        `Schema validation failed: ${truncate(result.error.message)}; payload: ${truncate(message.content)}`,
      );
    }

    await this.interactions.record({ ...common, success: true, response: parsed });
    // Usage metadata only — never prompt or response content (patient data).
    this.logger.log(
      `AI ok (type=${opts.type}, model=${model}, promptTokens=${promptTokens ?? '?'}, completionTokens=${completionTokens ?? '?'}, latencyMs=${latencyMs}, costUsd=${common.estimatedCostUsd ?? '?'})`,
    );
    return result.data;
  }
}
```

Type note: if `zodResponseFormat(opts.schema, ...)` complains about `ZodType<T>` vs its expected schema type, widen the cast at the call site (`opts.schema as never`) rather than loosening `GenerateStructuredOptions`.

- [ ] **Step 4: Run to verify pass**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- openai.provider
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/openai.provider.ts apps/api/src/ai/openai.provider.spec.ts
git commit -m "feat(api): OpenAIProvider structured-output gateway"
```

---

## Task 6: AiModule + AppModule wiring

**Files:**
- Create: `apps/api/src/ai/ai.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the module**

Create `apps/api/src/ai/ai.module.ts` (`PrismaModule` is global; no imports needed):

```ts
import { Module } from '@nestjs/common';
import { OpenAIProvider } from './openai.provider';
import { AiInteractionsService } from './ai-interactions.service';

@Module({
  providers: [OpenAIProvider, AiInteractionsService],
  exports: [OpenAIProvider],
})
export class AiModule {}
```

- [ ] **Step 2: Register in `AppModule`**

In `apps/api/src/app.module.ts`, add after the `MealPlansModule` import line:

```ts
import { AiModule } from './ai/ai.module';
```

and in the `imports` array, right after `MealPlansModule,`:

```ts
    AiModule,
```

- [ ] **Step 3: Build**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/ai/ai.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): wire AiModule"
```

---

## Task 7: Full suite verification

- [ ] **Step 1: Full unit suite**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test
```

Expected: PASS — all suites (existing 65 + new pricing/interactions/provider/env tests).

- [ ] **Step 2: Full e2e suite**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test:e2e
```

Expected: PASS — 36 tests; the new migration auto-applies to the test DB. (No new e2e: this step ships no endpoints. The boot-time env validation passes because both new vars have defaults.)

- [ ] **Step 3: Build**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build
```

Expected: success.

---

## Self-review checklist (for the implementer to confirm at the end)

- [ ] **Spec coverage:** centralized module ✓ (Task 5/6), structured-only via zodResponseFormat + Zod re-validation ✓ (Task 5), audit on success AND failure ✓ (Task 4/5), tokens/latency/cost/model logged ✓ (Task 5), env-configurable tiers with defaults ✓ (Task 2), extended AIInteraction + RESTRICT FK ✓ (Task 1), never-throwing audit writer ✓ (Task 4), no endpoints ✓, no SDK usage outside the provider ✓.
- [ ] **No PII in logs:** the provider logs usage metadata only; prompt/response content goes only to the DB audit row.
- [ ] **Naming consistency:** `generateStructured`, `record`, `estimateCostUsd`, `ModelTier`, `GenerateStructuredOptions` match across Tasks 3–6; Prisma delegate `aIInteraction` everywhere.
