# Meal plans (Plano alimentar) + AI — UI Design

**Date:** 2026-06-27
**Status:** Approved (pending implementation plan)
**Scope:** The web UI for a patient's meal plans: list a patient's plans, create one manually, generate one with AI (one click), view/edit the full meals→items tree with macros and daily targets, and delete. Over the existing, fully-tested backend (`/v1/meal-plans` CRUD + `POST /v1/ai/generate-meal-plan`). Nutritionist writes; employee is read-only.
**Builds on:** the patients UI patterns (React Query + `browserApiFetch` + shared-types, react-hook-form/zod, the `canEdit`/`getCurrentUser` permission plumbing, the `BioimpedanceSection`-style per-patient section). New branch `feat/meal-plans-ui` off `main` (which already has the employees + bioimpedance work).

---

## 1. Goal

On a patient's page, a nutritionist can manage that patient's meal plans end-to-end: see the list, build one by hand or generate one with AI from the patient's stored clinical data, edit the meals/items and per-day macro targets, and delete. An employee sees the same, read-only. Done when: the patient detail page has a "Planos alimentares" section listing the plans with "Novo plano" + "Gerar com IA"; opening a plan shows the editor (`/patients/[id]/planos/[planId]`) with a targets-vs-totals bar and editable meal cards; saving persists the whole tree; generating creates a plan from the patient and opens it; an employee sees everything without any write affordance.

## 2. Context: backend is done (no API changes)

All endpoints exist and are unit + e2e tested (no backend work in this slice):

- `POST /v1/meal-plans` (NUTRITIONIST) — `CreateMealPlanDto` (`patientId` + the update fields). `aiGenerated` is server-controlled (`false` here).
- `GET /v1/meal-plans?patientId=<uuid>` (NUTRITIONIST, EMPLOYEE) — summary list (scalar fields, no meals tree), scoped to the nutritionist (EMPLOYEE → owner).
- `GET /v1/meal-plans/:id` (NUTRITIONIST, EMPLOYEE) — full tree (meals ordered by `order`, each with ordered items).
- `PATCH /v1/meal-plans/:id` (NUTRITIONIST) — `UpdateMealPlanDto`. If `meals` is omitted → patches top-level only; if `meals` is present → **replaces the whole tree** in a transaction.
- `DELETE /v1/meal-plans/:id` (NUTRITIONIST) — cascades meals + items.
- `POST /v1/ai/generate-meal-plan` (NUTRITIONIST) — body `{ patientId }`; synchronous; reads the patient profile + latest assessment, computes daily targets server-side, the AI returns the meals/items structure, persists with `aiGenerated: true`, and returns the full plan (same shape as `GET /:id`). Returns **422** listing missing clinical fields if the profile is incomplete.

Data model (relational): `MealPlan → Meal → MealItem`. Plan holds `title?`, `objective?` (free text), `aiGenerated`, and `targetCalories/Protein/Carbs/Fats` (kcal & g/day, nullable). `Meal` holds `name?`, `timeLabel?`, `instructions?`, `order`. `MealItem` holds `foodName?`, `quantity?` (free text), `calories/protein/carbs/fats` (nullable), `order`. DTO max lengths: title 200, objective 500, meal name 200, timeLabel 100, instructions 2000, foodName 200, quantity 100; all macros `≥ 0`.

**Important behavior — AI fills structure, not item macros:** the AI returns only meal names/time labels + food names/quantities, and the backend sets the **plan-level** targets. Per-item `calories/protein/carbs/fats` come back **null**. So a freshly generated plan shows its daily targets but the summed item totals start empty until the nutritionist fills macros. The UI surfaces null macros as "—" and the totals reflect only filled values.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Scope | Full CRUD + AI generation in one slice. |
| Location | Sub-routes under the patient. A "Planos alimentares" **section on the patient detail page** lists the plans; the **editor is a dedicated route** `/patients/[id]/planos/[planId]` (+ `/patients/[id]/planos/novo` for a blank plan). |
| Editor layout | "Layout A": a sticky **targets × totals** bar (Kcal/P/C/G) + meal **cards**, each with an items table (food, qty, kcal/P/C/G, remove) and a subtotal; inline "adicionar item/refeição"; reorder via **↑/↓ buttons** (no drag-and-drop lib). |
| Save model | Explicit **Salvar**; sends the whole tree (PATCH with `meals`). Create-mode first save calls `POST`. |
| AI generate | One click (no options dialog — backend takes only `patientId`); shows a loading state; on success navigates to the new plan's editor; on **422** shows the missing fields + a link to edit the patient. |
| Targets | The plan's `targetCalories/Protein/Carbs/Fats` are editable inputs; totals are summed from item macros (null treated as 0) and compared to targets (over/under indicator). |
| Permissions | `canEdit` (= `canManagePatients(role)`, already on `PatientDetail`) gates every write affordance; employees see list + editor read-only. |
| Food data | None — `foodName`/`quantity` are free text and macros are entered manually (there is no Food table). No autocomplete. |

## 4. shared-types (`packages/shared-types/src/v1`)

New `meal-plan.ts` (dates ISO strings; nullable mirrors the DB):

- `MealItem { id; mealId; foodName: string | null; quantity: string | null; calories: number | null; protein: number | null; carbs: number | null; fats: number | null; order: number }`
- `Meal { id; mealPlanId; name: string | null; timeLabel: string | null; instructions: string | null; order: number; items: MealItem[] }`
- `MealPlan { id; patientId; title: string | null; objective: string | null; aiGenerated: boolean; targetCalories: number | null; targetProtein: number | null; targetCarbs: number | null; targetFats: number | null; createdAt: string; updatedAt: string; meals: Meal[] }`
- `MealPlanSummary = Omit<MealPlan, 'meals'>` (the list shape).
- `MealItemInput { foodName?; quantity?; calories?; protein?; carbs?; fats? }`; `MealInput { name?; timeLabel?; instructions?; items?: MealItemInput[] }`.
- `CreateMealPlanRequest { patientId: string; title?; objective?; targetCalories?; targetProtein?; targetCarbs?; targetFats?; meals?: MealInput[] }`.
- `UpdateMealPlanRequest { title?; objective?; targetCalories?; targetProtein?; targetCarbs?; targetFats?; meals?: MealInput[] }`.
- `GenerateMealPlanRequest { patientId: string }`.
Export from `index.ts`.

## 5. Web — data layer

- `lib/api/meal-plans.ts` (via `browserApiFetch`): `listMealPlans(patientId): Promise<MealPlanSummary[]>` (GET `/meal-plans?patientId=`), `getMealPlan(id): Promise<MealPlan>`, `createMealPlan(body: CreateMealPlanRequest): Promise<MealPlan>`, `updateMealPlan(id, body: UpdateMealPlanRequest): Promise<MealPlan>`, `deleteMealPlan(id): Promise<void>`, `generateMealPlan(patientId): Promise<MealPlan>` (POST `/ai/generate-meal-plan`).
- `lib/queries/meal-plans.ts`: `useMealPlans(patientId)` (key `['meal-plans', patientId]`), `useMealPlan(id)` (key `['meal-plan', id]`), `useCreateMealPlan(patientId)`, `useUpdateMealPlan(patientId)` (mutationFn `{ id, body }`), `useDeleteMealPlan(patientId)` (mutationFn `id`), `useGenerateMealPlan(patientId)` (mutationFn `patientId`). Mutations invalidate `['meal-plans', patientId]`; update also sets/invalidates `['meal-plan', id]`.
- `lib/validation/meal-plan.ts`: `mealPlanSchema` — `title`/`objective` optional with max lengths; `targetCalories/Protein/Carbs/Fats` optional, coerced, `≥ 0` (the `emptyToUndefined` + `z.coerce.number()` pattern); `meals` an array of `{ name?, timeLabel?, instructions?, items?: [{ foodName?, quantity?, calories?, protein?, carbs?, fats? }] }` with the same max-length / `≥ 0` rules. Export `MealPlanFormValues`.

## 6. Web — list (patient detail section)

`MealPlansSection({ patientId, canEdit })` rendered on the patient detail page (alongside `BioimpedanceSection`):
- `useMealPlans(patientId)`. States: loading (skeleton), error (+ retry), empty ("Nenhum plano ainda" + CTAs when `canEdit`).
- Header "Planos alimentares" + (when `canEdit`) **"Novo plano"** (link → `/patients/[id]/planos/novo`) and **"✨ Gerar com IA"** (calls `useGenerateMealPlan`; shows a loading state; on success `router.push('/patients/[id]/planos/' + plan.id)`; on `ApiError 422` shows which clinical fields are missing + a link to the patient edit; other errors → toast).
- List: cards/rows per plan — title (or "Sem título"), objective, `createdAt` (`dd/MM/yyyy`), an "IA" badge when `aiGenerated`, and the target kcal. Click → `/patients/[id]/planos/[planId]`.

## 7. Web — editor (route)

Routes: `/patients/[id]/planos/[planId]/page.tsx` and `/patients/[id]/planos/novo/page.tsx` (static `novo` wins over the dynamic segment). Each is a server component: fetches the role via `getCurrentUser`, computes `canEdit = canManagePatients(role)`, and renders `<MealPlanEditor patientId canEdit planId? />`.

`MealPlanEditor` (client):
- **Create mode** (`novo`, no `planId`): starts from a blank form (one empty meal). **Edit mode**: `useMealPlan(planId)` loads the tree; loading/error/not-found states.
- react-hook-form + `mealPlanSchema`, with a field array for `meals` and nested `items`.
- **Header:** editable `title`, `objective`, an "IA" badge when `aiGenerated`; (when `canEdit`) **Salvar** and **Excluir** (inline-confirm) buttons; a back link to the patient.
- **Metas (por dia) row + totals bar (sticky):** a "Metas (por dia)" row with four editable inputs — `targetCalories/Protein/Carbs/Fats` — sits just below the header; the sticky bar shows, per metric (Kcal/P/C/G), the live **total** (summed from item macros, null = 0) and, when that target is set, `total / target` with an over/under color.
- **Meal cards:** each meal = `name` + `timeLabel` + `instructions` + an items table (`foodName`, `quantity`, `calories`, `protein`, `carbs`, `fats`, remove) + a per-meal subtotal row. "Adicionar item" per card; "Adicionar refeição" at the bottom; ↑/↓ to reorder meals (and items within a meal). Null macros render as "—" in read-only / placeholder in edit.
- **Save:** create mode → `createMealPlan(form)` then `router.replace('/patients/[id]/planos/' + created.id)`; edit mode → `updateMealPlan({ id, body: form })` (sends `meals` → full-tree replace) + toast. **Delete:** inline confirm → `deleteMealPlan(id)` → `router.push('/patients/[id]')`.
- **Read-only (`canEdit=false`):** fields disabled (the `<fieldset disabled>` pattern), Salvar/Excluir/add/remove/reorder hidden.

## 8. AI generation flow

Entry is the section's "✨ Gerar com IA". `useGenerateMealPlan(patientId).mutateAsync(patientId)` → the button shows a spinner / disabled "Gerando…" (the call is synchronous and can take several seconds). On success → navigate to the new plan's editor (it opens with the AI structure + plan targets; item macros empty). On `ApiError` with status `422` → render the returned missing-field list (mapped to pt-BR labels: peso, altura, data de nascimento, gênero, objetivo, nível de atividade) with a "Completar cadastro" link to the patient edit. Other errors → a generic pt-BR toast.

## 9. Error handling / states

Forms: inline zod messages (pt-BR). API errors via `err instanceof ApiError`. List + editor: loading / empty / error(+retry) / not-found. Generation: loading + 422 missing-fields surface + generic fallback. Mutations disable their buttons while pending and invalidate the relevant keys.

## 10. Permissions

`canEdit` is derived once per route from the role (`canManagePatients`) and threaded into `MealPlansSection` and `MealPlanEditor`. It gates: "Novo plano", "Gerar com IA", Salvar, Excluir, and all add/remove/reorder/field editing. The `novo` route additionally renders `Unauthorized` for a non-editor (creating requires nutritionist). The API independently enforces all of this.

## 11. Testing (Vitest + RTL; no backend changes)

- API funcs (paths/methods/bodies, incl. the `?patientId=` query and the generate path).
- `mealPlanSchema` (valid tree; max-length and `≥ 0` rejections; empty/optional fields allowed).
- `MealPlansSection` (loading/empty/error; renders plan rows + IA badge; `canEdit=false` hides CTAs; "Gerar com IA" calls generate and on 422 shows missing fields; on success navigates).
- `MealPlanEditor` (renders the loaded tree; add/remove meal + item; reorder ↑/↓ changes order; totals sum from item macros and compare to targets; Salvar calls create (new) / update with the `meals` tree (edit); delete inline-confirm calls deleteMealPlan; `canEdit=false` hides write affordances + disables fields).
- Route guards: `novo` page renders `Unauthorized` for an employee.

## 12. Out of scope (YAGNI)

A food database / autocomplete (free-text items + manual macros); the AI computing per-item macros (backend returns none); the patient mobile surface (`/me/meal-plans`); PDF/print export; drag-and-drop reordering; duplicating/templating plans; versioning/history of a plan.
