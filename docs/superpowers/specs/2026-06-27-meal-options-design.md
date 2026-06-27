# Multiple food options per meal — Design

**Date:** 2026-06-27
**Status:** Approved (pending implementation plan)
**Scope:** Sub-project **C** of the 4-part batch (A Settings ✅ → B AI instructions ✅ → **C** meal options → D PDF). Each meal in a plan can hold several interchangeable **options** (e.g. "Café da manhã — Opção 1 / Opção 2"), where each option is a set of food items the patient can pick between. Today a meal owns a single flat list of items.
**Builds on:** the meal-plan aggregate (`MealPlan → Meal → MealItem`, `MealPlansService.createPlan`/`updatePlan`/`createGeneratedPlan`, the `FULL_TREE` include), the `MealPlanEditor` (nested `useFieldArray`), the AI generation pipeline (`mealPlanResponseSchema`, `MEAL_PLAN_SYSTEM_PROMPT`, `buildMealPlanUserPrompt`, `MealGenerationService.generate`), shared-types `meal-plan.ts`, and the zod `mealPlanSchema`. Same branch `feat/meal-plans-ui`.

---

## 1. Goal

A nutritionist can give a meal several interchangeable options, and "Gerar com IA" produces two macro-equivalent options per meal automatically. Done when: the data model has a `MealOption` between `Meal` and `MealItem`; the editor lets a nutritionist add/remove options per meal (each option a labeled item list with its own subtotal) and add/remove items within an option; the day-totals bar sums the **first** option of each meal; AI generation returns two options per meal and persists them; an employee still sees the plan read-only.

## 2. Context

- Current model: `MealPlan 1─* Meal 1─* MealItem`. `Meal` has `name/timeLabel/instructions/order/items[]`; `MealItem` has `foodName/quantity/calories/protein/carbs/fats/order` and FK `mealId`.
- `MealPlansService` writes the whole tree via `mealsCreateInput` (server-assigns `order` from array index at each level) and reads via `FULL_TREE` (`meals` ordered, each with ordered `items`). `updatePlan` with a `meals` payload deletes all meals (cascade removes items) and recreates them in one transaction.
- The AI returns `{ title, meals: [{ name, timeLabel, items: [{ foodName, quantity, calories, protein, carbs, fats }] }] }`; `MealGenerationService` maps that into `createGeneratedPlan`. The day targets are server-computed and stored on `MealPlan`; per-item macros are AI estimates.
- The `MealPlanEditor` is the only renderer (the patient/PDF views are out of scope here); employees get it read-only via `fieldset disabled`. The totals bar sums every item across every meal.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Model | New entity **`MealOption`** between `Meal` and `MealItem`: `MealPlan → Meal → MealOption → MealItem`. |
| AI generation | The AI generates **two** interchangeable, macro-equivalent options per meal (labeled "Opção 1"/"Opção 2"), in pt-BR. |
| Day totals | The "Totais (por dia)" bar sums **only the first (primary) option** of each meal (options are alternatives). Each option card shows its own subtotal. |
| Existing data | Meal-plan data on the shared dev DB is **disposable** — the migration drops it and restructures; **no backfill**. |
| Option label | `label String?`, auto-numbered "Opção N" in the UI when empty; AI sets "Opção 1"/"Opção 2". |
| Read-only | Employees keep the `fieldset disabled` read-only editor (unchanged). |

## 4. Backend — data model

`apps/api/prisma/schema.prisma`:
- **New `MealOption`**: `id String @id @default(uuid())`, `mealId String`, `meal Meal @relation(fields: [mealId], references: [id], onDelete: Cascade)`, `label String?`, `order Int`, `createdAt DateTime @default(now())`, `items MealItem[]`, `@@index([mealId])`.
- **`Meal`**: replace `items MealItem[]` with `options MealOption[]`.
- **`MealItem`**: replace `mealId`/`meal` with `mealOptionId String` + `mealOption MealOption @relation(fields: [mealOptionId], references: [id], onDelete: Cascade)`; keep `foodName/quantity/calories/protein/carbs/fats/order`; index becomes `@@index([mealOptionId])`.

**Migration:** because existing plans are disposable, the migration clears the meal-plan tables before restructuring (e.g. `DELETE FROM "MealPlan"` cascades to meals/items, or truncate the affected tables) so the new `MealItem.mealOptionId` NOT-NULL FK applies to empty tables. Then create `MealOption`, drop `MealItem.mealId` (+ its FK/index), add `MealItem.mealOptionId` (+ FK/index). Run against the dev DB and regenerate the client. This is intentionally **not** additive (per the disposable-data decision).

## 5. shared-types (`packages/shared-types/src/v1/meal-plan.ts`)

- `MealItem`: `mealId: string` → `mealOptionId: string` (other fields unchanged).
- New `MealOption { id: string; mealId: string; label: string | null; order: number; items: MealItem[] }`.
- `Meal`: `items: MealItem[]` → `options: MealOption[]`.
- Inputs: new `MealOptionInput { label?: string; items?: MealItemInput[] }`; `MealInput`: `items?: MealItemInput[]` → `options?: MealOptionInput[]`.
- `CreateMealPlanRequest`/`UpdateMealPlanRequest`/`MealPlanSummary`/`GenerateMealPlanRequest` keep their own fields; the change reaches them only through `MealInput` (or, for `MealPlanSummary`, not at all — it omits `meals`).

## 6. Backend — service + DTOs

- **DTOs** (`apps/api/src/meal-plans/dto`): new `MealOptionDto { label?: string (≤200); items?: MealItemDto[] (@ValidateNested) }`. `MealDto.items` → `MealDto.options?: MealOptionDto[]` (`@ValidateNested({ each: true })`, `@Type(() => MealOptionDto)`).
- **`MealPlansService`**:
  - `mealsCreateInput`: `meals.map((m, i) => ({ name, timeLabel, instructions, order: i, options: { create: (m.options ?? []).map((o, j) => ({ label: o.label, order: j, items: o.items ? { create: o.items.map((it, k) => ({ ...it, order: k })) } : undefined })) } }))`.
  - `FULL_TREE`: `meals` ordered, each `include: { options: { orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' } } } } }`.
  - `GeneratedMealInput`: `{ name: string; timeLabel?: string; options: { label?: string; items: { foodName; quantity; calories; protein; carbs; fats }[] }[] }`.
  - `createPlan`/`updatePlan`/`createGeneratedPlan` keep their current control flow (ownership, wholesale tree replace on update); only the nested write/read shape changes.

## 7. Backend — AI generation

- **`mealPlanResponseSchema`** (`meal-generation/schema`): each `meal` gains `options: z.array(optionSchema).min(1)`, where `optionSchema = z.object({ label: z.string(), items: z.array(itemSchema).min(1) })` and `itemSchema` is the existing `{ foodName, quantity, calories, protein, carbs, fats }`. `meals` keeps `name`, `timeLabel` (nullable). (OpenAI strict mode ignores array length bounds beyond presence, so "exactly 2" is enforced via the prompt, not the schema; schema requires ≥1.)
- **`MEAL_PLAN_SYSTEM_PROMPT`**: add an instruction to produce **exactly two** interchangeable, macro-comparable options per meal (switching options must not change the day's targets), labeled "Opção 1"/"Opção 2", keeping all existing rules (don't recalculate targets, estimate per-item macros, respect allergies/restrictions, follow default/custom instructions but never override safety/targets, pt-BR).
- **`MealGenerationService.generate`**: map `generated.meals.map(m => ({ name: m.name, timeLabel: m.timeLabel ?? undefined, options: m.options.map(o => ({ label: o.label, items: o.items })) }))` into `createGeneratedPlan`.

## 8. Web — validation (`lib/validation/meal-plan.ts`)

- New `mealOptionSchema = z.object({ label: optText(200), items: z.array(mealItemSchema) })`.
- `mealSchema`: `items: z.array(mealItemSchema)` → `options: z.array(mealOptionSchema)`.
- `MealPlanFormValues` updates accordingly (draft-friendly: empty arrays allowed).

## 9. Web — editor (`components/patients/meal-plan-editor.tsx`)

- **Form shape**: `meals[].items` → `meals[].options[].items` (`options[]` adds `label: string`). `blankItem()` unchanged; new `blankOption() = { label: '', items: [blankItem()] }`; `blankMeal() = { name:'', timeLabel:'', instructions:'', options: [blankOption()] }`. `toDefaults` maps `plan.meals[].options[].items`.
- **Three nested `useFieldArray` levels**: meals (top) → options (in `MealCard`) → items (in a new `OptionCard`). Extract `OptionCard` (the current items table + add/remove/reorder item controls + a per-option subtotal row) and render one per option inside `MealCard`; `MealCard` gains an options field array + "+ Adicionar opção" and per-option remove/reorder (↑/↓/✕) controls. Each option shows a label (input or auto "Opção N") and its subtotal (kcal/P/C/G) computed from its own items.
- **Day totals**: `totalFor(macro)` sums `meals[].options[0]?.items` only (first option per meal). Targets row unchanged. Each option's subtotal is independent of the day total.
- Read-only (`fieldset disabled`) and the delete/save flows are unchanged.

## 10. Error handling / states

A new meal seeds one option ("Opção 1") with one blank item; a new option seeds one blank item. Empty options/items are allowed while drafting (zod arrays may be empty). A meal with zero options contributes 0 to the day totals (`options[0]` is `undefined`). Save errors and the AI 422 (incomplete patient) are surfaced exactly as today (inline banner / the generate dialog). `aiGenerated` stays server-controlled.

## 11. Testing

- **API (Jest):** `meal-plans.service.spec` — create/update/get round-trip the `meals→options→items` tree, with `order` assigned at all three levels from array position, and `update` replacing the tree wholesale. `meal-generation.service.spec` — `generate` maps the AI options→items into `createGeneratedPlan` (assert two options per meal reach it). `meal-plan-response.schema.spec` — the schema accepts a meal with an `options` array (each option ≥1 item) and rejects a meal without options. `meal-plan.prompt.spec` — the system prompt instructs two macro-comparable options per meal (and keeps the existing assertions).
- **Web (Vitest + RTL):** `meal-plan.test` — `mealPlanSchema` validates the option nesting. `meal-plan-editor.test` — renders options; "+ Adicionar opção"/remove-option and "+ Adicionar item"/remove-item within an option work; the day total sums only the first option of each meal; each option shows its own subtotal; read-only hides the add/remove controls.

## 12. Out of scope (this slice)

Per-option daily targets; AI generating more than two options (or a user-chosen count); drag-reordering options; option-level instructions/notes; the PDF export (sub-project D) and any patient-app rendering of options.
