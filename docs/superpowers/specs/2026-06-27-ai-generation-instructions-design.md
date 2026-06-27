# AI generation with custom instructions — Design

**Date:** 2026-06-27
**Status:** Approved (pending implementation plan)
**Scope:** Sub-project **B** of the 4-part batch (A Settings ✅ → **B** → C meal options → D PDF). When a nutritionist clicks "✨ Gerar com IA", open a dialog with a free-text **"Instruções personalizadas"** field that the AI considers for that generation; and have the backend also incorporate the nutritionist's **default** AI instructions (`mealPlanAiInstructions`, persisted in sub-project A) into the prompt for **every** patient's generation. Per-patient instructions are **ephemeral** (typed each time, not stored) and **free text** (no structured form).
**Builds on:** the meal-plan generation pipeline (`POST /v1/ai/generate-meal-plan`, `MealPlanPromptContext`/`buildMealPlanUserPrompt`, `MEAL_PLAN_SYSTEM_PROMPT`), the `MealPlansSection` "Gerar com IA" button + `useGenerateMealPlan`, the `missingFieldsFromError` 422 helper, and A's `NutritionistProfile.mealPlanAiInstructions`. Same branch `feat/meal-plans-ui`.

---

## 1. Goal

A nutritionist can guide the AI per generation ("apenas 4 refeições", "incluir whey ~24g proteína no pós-treino") via a dialog, and their saved default instructions apply to all generations automatically — without ever overriding the patient's allergies/restrictions or the server-computed daily targets. Done when: "✨ Gerar com IA" opens a dialog with an optional free-text field; submitting generates a plan that reflects both the typed instructions and the nutritionist's default instructions; the generated plan opens in the editor; an incomplete patient profile still surfaces the missing fields (422) inside the dialog.

## 2. Context

- `POST /v1/ai/generate-meal-plan` currently takes only `{ patientId }`; `MealGenerationService.generate(ctx, patientId)` builds the prompt from the patient context + server-computed targets via `buildMealPlanUserPrompt(ctx)`; `MEAL_PLAN_SYSTEM_PROMPT` is a static system message.
- The web `MealPlansSection` "✨ Gerar com IA" button calls `useGenerateMealPlan(patientId).mutateAsync(patientId)` directly, then navigates to the new plan or surfaces a 422 via `missingFieldsFromError`.
- Sub-project A added `NutritionistProfile.mealPlanAiInstructions` (default instructions). It is currently persisted/exposed but **not** used in generation — B wires it in.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Per-patient input | **Free text** (single textarea), interpreted by the model. No structured form. |
| Persistence | **Ephemeral** — typed in the dialog each generation; nothing stored on the patient. (No model change.) |
| Default instructions | The nutritionist's `mealPlanAiInstructions` (from A) is fetched server-side and injected into **every** generation's prompt. |
| Safety ordering | Allergies, restrictions, and the daily targets remain **authoritative**; free-text instructions must never override them. Enforced in the system prompt. |
| Trigger | "✨ Gerar com IA" now opens a dialog; the generate/navigate/422 flow moves from `MealPlansSection` into the dialog. |

## 4. Backend

- **`apps/api/src/meal-generation/dto/generate-meal-plan.dto.ts`**: add `instructions?: string` (`@IsOptional() @IsString() @MaxLength(2000)`).
- **`apps/api/src/ai/prompts/meal-plan.prompt.ts`**:
  - `MealPlanPromptContext` gains `defaultInstructions: string | null` and `customInstructions: string | null` (always present; `null` when absent — the JSON context stays uniform).
  - `buildMealPlanUserPrompt` includes them in the serialized context.
  - `MEAL_PLAN_SYSTEM_PROMPT` gains a line: *"If the context includes `defaultInstructions` or `customInstructions`, follow them as additional guidance — but they must NEVER override the patient's allergies/restrictions or change the daily targets."* (Allergies/restrictions/targets stay authoritative.)
- **`apps/api/src/meal-generation/meal-generation.service.ts`** `generate(ctx, patientId, instructions?)`:
  - After resolving the nutritionist scope, fetch `mealPlanAiInstructions` from the nutritionist's profile (`nutritionistProfile.findUnique({ where: { id: nutritionistId }, select: { mealPlanAiInstructions: true } })`).
  - Pass `defaultInstructions: <fetched> ?? null` and `customInstructions: instructions ?? null` into `buildMealPlanUserPrompt`.
  - Everything else (target computation, 422 on incomplete profile, provider call, persistence) is unchanged.
- **`meal-generation.controller.ts`**: `generateMealPlan(ctx, dto)` → `generate(ctx, dto.patientId, dto.instructions)`.
- The `AIInteraction` audit already records the user prompt, so the instructions are captured for traceability.

## 5. shared-types

`GenerateMealPlanRequest` (existing) gains `instructions?: string`:
```ts
export interface GenerateMealPlanRequest {
  patientId: string;
  instructions?: string;
}
```

## 6. Web

- **`lib/api/meal-plans.ts`** `generateMealPlan(patientId: string, instructions?: string)` → POST `/ai/generate-meal-plan` body `{ patientId, instructions }` (omit `instructions` when undefined is fine — the API treats it as optional).
- **`lib/queries/meal-plans.ts`** `useGenerateMealPlan(patientId)`: mutationFn `(instructions?: string) => generateMealPlan(patientId, instructions)` (changed from the no-arg/patientId form); still invalidates `['meal-plans', patientId]`.
- **`AiGenerateDialog`** (`apps/web/src/components/patients/ai-generate-dialog.tsx`, new): a shadcn `Dialog` with a free-text **`Textarea`** ("Instruções personalizadas (opcional)") + a muted note that "As instruções padrão das suas Configurações também se aplicam." + footer Cancelar / **"Gerar plano"** (disabled + "Gerando…" while pending). On submit: `useGenerateMealPlan(patientId).mutateAsync(instructions || undefined)` → on success `router.push('/patients/{patientId}/planos/{plan.id}')`; on `ApiError 422` → render the `missingFieldsFromError` list inline + a "Completar cadastro" link to the patient; other errors → pt-BR toast. The generate/navigate/422 logic lives here (moved out of the section).
- **`MealPlansSection`**: the "✨ Gerar com IA" button now sets `generating=true` to open `<AiGenerateDialog open={generating} onOpenChange=… patientId=… />`; the section no longer calls generate directly or holds the `missing` state. "Novo plano" stays unchanged.

## 7. Permissions / errors / states

Generation stays NUTRITIONIST-only (API roles + the dialog is only reachable from the `canEdit`-gated button). The dialog disables its submit while pending; 422 shows the missing clinical fields inline; other errors toast in pt-BR. The instructions field is optional (empty → a generation guided only by the default instructions + patient data).

## 8. Testing

- **API (Jest):** `meal-generation.service` — `generate` fetches the nutritionist's `mealPlanAiInstructions` and passes `defaultInstructions` + `customInstructions` into the prompt context (assert the values reach `buildMealPlanUserPrompt`/the provider call); the existing 404 / 422 / provider-failure / happy-path cases stay. `meal-plan.prompt.spec` — the user prompt JSON includes `defaultInstructions`/`customInstructions`; the system prompt contains the "follow … but never override allergies/restrictions/targets" instruction (and still keeps the don't-recalculate-targets line).
- **Web (Vitest + RTL):** `generateMealPlan` api func sends `{ patientId, instructions }`; `useGenerateMealPlan` mutationFn passes the instructions; `AiGenerateDialog` (renders the textarea; submit calls generate with the typed text and navigates on success; 422 shows the missing-fields message and does not navigate); `MealPlansSection` ("Gerar com IA" opens the dialog rather than generating directly).

## 9. Out of scope

Persisting per-patient instructions (ephemeral for now); a structured instructions form; per-category default instructions; editing the default instructions from the dialog (that lives in Configurações); streaming/preview of the AI output.
