# Step 06 — AI Meal Generation — Design

Status: approved (2026-06-17)
Builds on Step 05 (`docs/superpowers/specs/2026-06-11-ai-architecture-design.md`);
`docs/06-ai-meal-generation.md` remains the requirements source.

## Goal

Let a nutritionist generate an initial meal plan for a linked patient with one
call. The **server** owns all nutrition math (daily calories + protein/carbs/fats
targets); the **AI** only structures a meal plan of foods and amounts that meets
those server-computed targets. The result is persisted as a normal, editable
`MealPlan` that pre-fills a UI form the nutritionist can then edit.

This honors the Step 05 boundary contract: critical calculations happen in
backend services **before** the prompt is built, and the response schema never
asks the model for derived numbers.

## Endpoint

```txt
POST /v1/ai/generate-meal-plan
```

- Nutritionist only (`@Roles(NUTRITIONIST)` + `RolesGuard`).
- Request body: `{ patientId: string (uuid) }` only. All clinical inputs are read
  from stored records (Step 03), never from the request body.
- `201` → the persisted `MealPlan` with its full meals/items tree and targets.

## Scope decisions

- **Server computes, AI structures.** The server computes daily calorie and macro
  targets deterministically; the AI receives them as fixed goals and returns only
  meal/food structure. No derived numbers come back from the model.
- **Read from stored data, not the request body.** Inputs come from the patient's
  `PatientProfile` plus their most-recent `BodyAssessment`. The body is just
  `patientId`.
- **Persist immediately; edit via existing endpoints.** Generation creates a real
  `MealPlan` (`aiGenerated: true`). Editing reuses the Step 04 meal-plans
  endpoints (`PATCH /v1/meal-plans/:id`) — Step 06 adds **no** new editing code.
- **Targets are editable.** The four target fields are added to
  `UpdateMealPlanDto`, so the nutritionist can hand-tune calories/macros in the
  form via `PATCH` alongside the meal tree.
- **Audit is automatic.** The Step 05 `OpenAIProvider` already persists an
  `AIInteraction` row on every call (success and failure). Doc 06's "save
  AIInteraction" step requires no extra work here.

## Module structure

A new feature module; `AiModule` stays infrastructure-only (no controllers in
`ai/`).

```txt
apps/api/src/meal-generation/
  meal-generation.module.ts       // imports AiModule + MealPlansModule
  meal-generation.controller.ts   // POST /v1/ai/generate-meal-plan
  meal-generation.service.ts      // orchestration: fetch -> validate -> compute -> AI -> persist
  nutrition.ts                    // pure, unit-tested calculation functions + constants
  dto/
    generate-meal-plan.dto.ts     // { patientId: uuid }
  schema/
    meal-plan-response.schema.ts  // Zod schema for the AI response

apps/api/src/ai/prompts/
  meal-plan.prompt.ts             // pure string builder (system prompt + user-context builder)
```

The prompt builder lives under `ai/prompts/` per the Step 05 spec's reserved
location ("populated by Steps 06/08; each consumer owns its prompts"). It is a
pure function with no DI and no SDK access; the consumer service imports it.

## Data model

Additive migration on `MealPlan` — four nullable target fields. Nullable because
manually created Step 04 plans have no computed targets.

```prisma
model MealPlan {
  // ...existing fields...
  targetCalories Float?   // kcal/day, server-computed
  targetProtein  Float?   // g/day
  targetCarbs    Float?   // g/day
  targetFats     Float?   // g/day
}
```

- `aiGenerated` flips to `true` for generated plans and stays `true` as
  provenance even after the nutritionist edits the plan.
- AI-produced `MealItem`s carry `foodName` + `quantity` only; the macro columns
  (`calories/protein/carbs/fats`) stay null — the AI never returns derived
  numbers.
- Migration is additive; regenerate the Prisma client afterward (same workflow as
  Step 05's `AIInteraction` migration).

## Calculation engine (`meal-generation/nutrition.ts`)

Pure functions, no I/O, fully unit-tested. All constants live in one block at the
top of the file for easy tuning.

### Required inputs (else 422)

Read from profile + latest assessment. If **any** is missing, reject with `422`
naming the absent fields (no AI call, no plan):

| Field | Source |
|-------|--------|
| `weight` (kg) | latest `BodyAssessment.weight` |
| `height` (cm) | `PatientProfile.height` |
| `birthDate` | `PatientProfile.birthDate` |
| `gender` | `PatientProfile.gender` |
| `objective` | `PatientProfile.objective` |
| `activityLevel` | `PatientProfile.activityLevel` |

`basalMetabolicRate` (bioimpedance) from the latest assessment is **optional** —
used when present, otherwise the formula fallback applies.

### Steps

1. **Age** — whole years from `birthDate` to today.
2. **BMR** — measured `basalMetabolicRate` from the latest assessment if present;
   otherwise **Mifflin-St Jeor**: `10·kg + 6.25·cm − 5·age + s`, where
   `s = +5` (MALE), `−161` (FEMALE), `−78` (OTHER / PREFER_NOT_TO_SAY — the
   average of the two sex constants).
3. **TDEE** = BMR × activity factor.
4. **Calorie target** = TDEE × objective factor (rounded to whole kcal).
5. **Macros**:
   - `proteinG = proteinPerKg(objective) × weightKg`
   - `fatG = (calories × FAT_PCT) / 9`
   - `carbsG = max(0, (calories − proteinG·4 − fatG·9) / 4)`
   - all rounded to whole grams.

### Constants (approved defaults — single source of truth in code)

```ts
// kcal multipliers on BMR by activity level
ACTIVITY_FACTOR = {
  SEDENTARY: 1.2, LIGHT: 1.375, MODERATE: 1.55, ACTIVE: 1.725, VERY_ACTIVE: 1.9,
}

// calorie adjustment on TDEE by objective
OBJECTIVE_FACTOR = {
  WEIGHT_LOSS: 0.80, MAINTENANCE: 1.00, RECOMPOSITION: 0.95, MUSCLE_GAIN: 1.10,
}

// protein grams per kg bodyweight by objective
PROTEIN_PER_KG = {
  WEIGHT_LOSS: 2.0, MUSCLE_GAIN: 2.0, RECOMPOSITION: 2.0, MAINTENANCE: 1.6,
}

FAT_PCT = 0.25   // share of calories from fat
```

Output shape: `{ calories, protein, carbs, fats }` (all numbers).

## Prompt & response schema

- **Tier:** `'smart'` (quality matters for meal planning).
- **System prompt** (`ai/prompts/meal-plan.prompt.ts`): instructs the model that
  it is a clinical nutrition assistant; it must build a plan that **meets the
  given daily targets**, respect the patient's restrictions and allergies, and
  **must not recalculate** any targets. No PII-handling instructions beyond the
  data passed.
- **User prompt:** JSON-stringified context — `age, weight, height, gender,
  objective, activityLevel, restrictions, allergies` + the computed
  `{ calories, protein, carbs, fats }` targets.
- **Response Zod schema** (`schema/meal-plan-response.schema.ts`), passed to the
  provider via `zodResponseFormat`:

```ts
{
  title: string,
  meals: [                          // .min(1)
    {
      name: string,
      timeLabel?: string,
      items: [ { foodName: string, quantity: string } ]   // .min(1)
    }
  ]
}
```

The `.min(1)` constraints enforce doc 06's validation rules ("reject empty meals
/ malformed structure") at the provider's Zod gate. Invalid JSON, refusals, and
schema-mismatched payloads already become `BadGatewayException` inside the
provider (Step 05), with the offending payload captured in
`AIInteraction.errorMessage`.

## Flow (`MealGenerationService.generate(ctx, patientId)`)

1. **Fetch + ownership.** Load the patient scoped to `ctx`'s nutritionist
   (profile + latest assessment via `orderBy assessmentDate desc, take 1`). Not
   found or not owned ⇒ `404` (identical response for both, so existence does not
   leak — mirrors `PatientsService.requireOwned`).
2. **Validate inputs** ⇒ `422` listing any missing required fields.
3. **Compute targets** via `nutrition.ts`.
4. **Generate** — `provider.generateStructured({ tier: 'smart', system, user,
   schema, schemaName: 'meal_plan', type: MEAL_PLAN_GENERATION, patientId })`.
   The audit row is written automatically by the provider.
5. **Persist** — delegate to a new
   `MealPlansService.createGeneratedPlan(ctx, { patientId, title, targets, meals })`
   that reuses the existing ordered-tree write helper, re-checks ownership, sets
   `aiGenerated: true`, and writes the target fields.
6. **Return** the full saved plan (`include` meals→items ordered).

## Persistence reuse (`MealPlansService`)

Add one method so all `MealPlan` aggregate writes stay in `MealPlansService`
(single responsibility), reusing the private `mealsCreateInput` ordering helper:

```ts
createGeneratedPlan(ctx, args: {
  patientId: string;
  title?: string;
  targets: { calories: number; protein: number; carbs: number; fats: number };
  meals: { name: string; timeLabel?: string; items: { foodName: string; quantity: string }[] }[];
})
```

It performs `requireOwnedPatient`, then creates the plan with `aiGenerated: true`
and the four target columns. `MealGenerationModule` imports `MealPlansModule`
(which must export `MealPlansService`).

## DTO changes

- **New** `GenerateMealPlanDto`: `{ @IsUUID() patientId }`.
- **`UpdateMealPlanDto`** gains four optional, `@IsNumber() @Min(0)` fields:
  `targetCalories`, `targetProtein`, `targetCarbs`, `targetFats`. Because
  `CreateMealPlanDto extends UpdateMealPlanDto`, manual plans may also set them.
  `aiGenerated` remains server-controlled and is never accepted from input.

## Error handling

| Condition | Response |
|-----------|----------|
| Caller not a nutritionist | `403` (RolesGuard) |
| Patient missing or not linked to caller | `404` |
| Patient data incomplete for calculation | `422` (names missing fields) |
| OpenAI unavailable / network / non-2xx | `502` (provider) |
| Refusal / unparsable / schema-invalid response | `502` (provider) |

All AI failures are audited with `success: false` and an `errorMessage`; PII is
never logged (Step 05 contract).

## Testing strategy

**`nutrition.spec.ts`** (pure unit):
- Age from birthDate (incl. birthday-not-yet-reached this year).
- BMR: measured value used when present; Mifflin-St Jeor fallback per sex
  constant; OTHER/PREFER_NOT_TO_SAY uses −78.
- TDEE for each activity factor.
- Calorie target for each objective factor.
- Macro grams: protein per objective, 25% fat, carbs remainder, carbs floored at
  0 for an extreme high-protein/low-calorie case.

**`meal-generation.service.spec.ts`** (mocked `OpenAIProvider` + Prisma):
- `404` for unowned/missing patient.
- `422` for each missing required field.
- Happy path: provider called with the computed targets in the prompt; result
  persisted via `createGeneratedPlan` with `aiGenerated: true`, targets, and the
  ordered tree; saved plan returned.
- Provider throw (`BadGatewayException`) propagates unchanged; no plan persisted.

**`meal-generation.e2e-spec.ts`**:
- Guard/validation paths that short-circuit before OpenAI: `403` (patient role),
  `404` (cross-nutritionist patient), `422` (incomplete patient).
- Happy path with `OpenAIProvider` overridden by a stub
  (`.overrideProvider(OpenAIProvider).useValue(stub)`) — no real API call; the
  test asserts the persisted plan shape, `aiGenerated: true`, and targets.
- OpenAPI doc assertion: `/v1/ai/generate-meal-plan` present (mirrors the
  meal-plan path assertions in the Step 04 e2e suite).

**`meal-plans.service.spec.ts`** (extend existing): `createGeneratedPlan` sets
`aiGenerated: true` + targets and assigns order; `PATCH` accepts the new target
fields.

## Non-goals (from `docs/06-ai-meal-generation.md`)

- Streaming, chat interface, conversational AI.
- AI-produced macros or any AI-side calculation.
- Storing raw AI text as the primary plan structure (always normalized to
  relational tables).
- Patient-facing generation (nutritionist-only).
