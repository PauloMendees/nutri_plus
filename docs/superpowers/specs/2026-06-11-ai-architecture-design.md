# Step 05 — AI Architecture — Design

Status: approved (2026-06-11)
Supersedes the folder layout and `AIInteraction` sketch in `docs/05-ai-architecture.md`
where they differ; the original doc remains the requirements source.

## Goal

A centralized AI module: one gateway through which every AI interaction in the
system flows, with structured-only output, full audit logging (tokens, latency,
cost, model), and no AI access from anywhere else. Infrastructure only — no
user-facing endpoints. Consumers arrive in Step 06 (meal generation) and
Step 08 (outside-home assistant).

## Scope decisions

- **Concrete provider, no vendor abstraction.** A single `OpenAIProvider` class
  wraps the official `openai` SDK. No `AiProvider` interface/token until a second
  vendor actually exists (YAGNI; extracting an interface later is cheap).
- **Env-configurable model tiers.** Consumers request a tier (`'smart' | 'fast'`),
  never a literal model name. Tiers resolve from env (`OPENAI_MODEL_SMART`,
  default `gpt-4o`; `OPENAI_MODEL_FAST`, default `gpt-4o-mini`). Upgrading models
  is a config change.
- **Extended audit model.** `AIInteraction` stores the observability fields the
  requirements demand (model, tokens, latency, estimated cost) plus
  success/error, so failed calls are auditable too.
- **Folder layout follows the codebase**, not the doc's `src/modules/ai/`:
  features live at `apps/api/src/<feature>/`, so the module is `apps/api/src/ai/`.

## Module structure

```txt
apps/api/src/ai/
  ai.module.ts               // exports OpenAIProvider for consumer modules
  openai.provider.ts         // the single gateway to OpenAI
  ai-interactions.service.ts // persists AIInteraction audit rows
  pricing.ts                 // per-model USD-per-token map + cost estimator
  types/
    ai.types.ts              // ModelTier, GenerateStructuredOptions, etc.
  prompts/
    .gitkeep                 // populated by Steps 06/08; each consumer owns its prompts
```

The hard rule from the requirements doc stands: **never call OpenAI from a
controller**. Only `OpenAIProvider` touches the SDK; consumer services call
`generateStructured`.

## Data model

New enum + model; `PatientProfile` gains `aiInteractions AIInteraction[]`.
Migration is purely additive.

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

## Environment

Added to the Zod env schema (`env.schema.ts`), with defaults so existing
environments keep booting:

- `OPENAI_MODEL_SMART: z.string().default('gpt-4o')`
- `OPENAI_MODEL_FAST: z.string().default('gpt-4o-mini')`
- `OPENAI_API_KEY` already exists in the schema and becomes actually consumed.

Test env sources (`test/setup-e2e.ts`, `test/jest-setup-env.ts`) rely on the
defaults; no real key is ever needed in tests.

## Provider API

`OpenAIProvider` exposes one public method; consumers never see the SDK:

```ts
async generateStructured<T>(opts: {
  tier: ModelTier;                 // 'smart' | 'fast'
  system: string;                  // system prompt
  user: string;                    // user prompt (structured context, JSON-stringified)
  schema: ZodType<T>;              // expected response shape
  schemaName: string;              // name for OpenAI's json_schema response_format
  type: AIInteractionType;         // audit classification
  patientId?: string;              // audit linkage
}): Promise<T>
```

### Call flow

1. Resolve `tier` → model name from config.
2. Start a latency timer; call `chat.completions.create` with
   `response_format` built by the SDK's official `zodResponseFormat` helper
   (`openai/helpers/zod`, compatible with the project's Zod 3). Native
   structured outputs constrain the model to the schema at the API level —
   "never rely on free-text parsing" is enforced by the provider, not by hope.
3. Parse `choices[0].message.content` as JSON, then validate with the Zod
   schema anyway (belt-and-suspenders: strict mode still has edge cases such
   as refusals).
4. Compute `estimatedCostUsd` from `usage` tokens × the per-model pricing map
   in `pricing.ts`. Unknown model → `null` cost, never a crash.
5. Persist the `AIInteraction` row via `AiInteractionsService` — on success
   (response, tokens, latency, cost) AND on failure (`success: false`,
   `errorMessage`, whatever usage data exists). The audit write is awaited but
   guarded: a DB failure while logging a *successful* AI call logs a warning
   and still returns the result.
6. Log one structured line via Nest `Logger`: type, model, tokens, latency,
   cost. Never log prompt or response content (may contain patient data).

### Error mapping

Consumers receive Nest exceptions, never SDK errors (mirrors the
`SupabaseAdminService` pattern):

- SDK throw / network / non-2xx → `BadGatewayException('AI provider unavailable')`
- Refusal, unparsable JSON, or Zod validation failure →
  `BadGatewayException('AI returned an invalid response')`; the offending
  payload goes into `AIInteraction.errorMessage` for debugging.
- Server-side `logger.warn`/`error` with status/code — no PII.

### Boundary contract (consumer rule)

The provider is mechanism-only: it knows nothing about macros, BMI, or TDEE.
Per the requirements ("AI must not calculate"), all critical calculations
happen in backend services BEFORE the prompt is built; prompts pass computed
values in, and response schemas must not ask the model for derived numbers.
Step 06/07/08 designs must comply with this contract.

## Dependencies

- `openai` (official SDK; pinned to a version whose `zodResponseFormat`
  supports Zod 3 — the current 4.x/5.x line)
- No other new runtime dependencies. `zod` is already present.

## Testing strategy

Unit-level only (no endpoints in this step); consumers' e2e arrives in 06/08.

**`openai.provider.spec.ts`** — real provider instance, SDK client stubbed via
`(provider as any).client = { chat: { completions: { create: fn } } }` (same
technique as the `SupabaseAdminService` tests). Cases:
- success: returns the Zod-parsed object; audit row persisted with
  `success: true` and correct type/model/tokens/latency/cost
- tier resolution: `'smart'`/`'fast'` resolve to the env-configured models
- SDK throws → `BadGatewayException` + failed audit row
- Zod-invalid response → `BadGatewayException` + failed audit row with payload
  in `errorMessage`
- refusal (no content) → `BadGatewayException` + failed audit row
- audit-write failure on success → result still returned, warning logged

**`pricing.spec.ts`** — known model: correct prompt+completion cost; unknown
model: `null`.

**`ai-interactions.service.spec.ts`** — `prisma.aIInteraction.create` called
with the right shape (mockDeep).

**`env.schema.spec.ts`** — extended: model-tier defaults apply when omitted.

**E2E** — no new spec; existing suite stays green (migration auto-applies in
`setup-e2e.ts`).

## Non-goals (unchanged from `docs/05-ai-architecture.md`)

- Embeddings, vector database, memory systems, RAG
- Streaming, chat interfaces (Step 06's non-goals)
- Any user-facing endpoint (Steps 06/08)
- Multi-vendor abstraction layer
