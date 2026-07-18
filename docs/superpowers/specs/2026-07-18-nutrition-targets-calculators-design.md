# Nutrition Targets — GET/TMB Calculators + Macro Goals — Design

**Date:** 2026-07-18
**Branch:** `feat/nutrition-targets` (off main)
**Status:** Approved design — ready for implementation plan

**Sub-project B** of a 6-feature batch (order: F ✅ → **B** → A TACO → C LGPD → D anamnese → E push). A "Metas" calculator on the nutritionist web app that computes TMB (BMR), GET (TDEE) and macro targets from patient data and persists the chosen targets per patient (history), so the meal plan and the future TACO editor (sub-project A) can compare plano-vs-meta.

## Decisions (from brainstorming)

- **TMB formulas:** Mifflin-St Jeor (default) + a selector for Harris-Benedict and Katch-McArdle (Katch uses lean mass from body-fat %; falls back to Mifflin when %GC is absent).
- **kcal target:** suggested from GET adjusted by the patient's objective (pre-filled, fully editable).
- **Macros:** protein g/kg + fat % + carbs as the remainder.
- **Persistence:** a new `NutritionTarget` model with history.
- **Calc location:** pure functions in `packages/shared-types` (DRY across web live-preview and API authoritative persist) — **not duplicated**.

## Calculations (pure functions in `packages/shared-types/src/v1/energy.ts`)

All inputs come from the patient + latest `BodyAssessment`, and are editable in the form.

- **Age:** derived from `birthDate` (whole years).
- **Sex:** from `gender`; if `OTHER`/`PREFER_NOT_TO_SAY`, the form requires the nutritionist to pick the biological sex to use (`MALE`/`FEMALE`) for the estimate.
- **TMB (kcal/day):**
  - Mifflin-St Jeor: `10·kg + 6.25·cm − 5·age + s` (s = +5 male, −161 female).
  - Harris-Benedict (revised): male `88.362 + 13.397·kg + 4.799·cm − 5.677·age`; female `447.593 + 9.247·kg + 3.098·cm − 4.330·age`.
  - Katch-McArdle: `370 + 21.6·LBM`, LBM = `kg·(1 − bodyFat%/100)`. Requires `bodyFatPercentage`; if null, callers fall back to Mifflin.
- **GET (TDEE):** `TMB × activityFactor`. Factors: `SEDENTARY 1.2`, `LIGHT 1.375`, `MODERATE 1.55`, `ACTIVE 1.725`, `VERY_ACTIVE 1.9`.
- **Suggested kcal target:** `GET × (1 + adj)` where `adj` by objective: `WEIGHT_LOSS −0.20`, `MUSCLE_GAIN +0.10`, `MAINTENANCE 0`, `RECOMPOSITION 0`. Pre-filled, editable.
- **Macros (from the chosen `targetCalories`):**
  - Protein: `proteinGrams = proteinGramsPerKg × kg` (default `1.8` g/kg, editable); `proteinKcal = proteinGrams × 4`.
  - Fat: `fatKcal = targetCalories × fatPercent/100` (default `25`%, editable); `fatGrams = fatKcal / 9`.
  - Carbs (remainder): `carbKcal = targetCalories − proteinKcal − fatKcal`; `carbGrams = carbKcal / 4`. If negative (protein + fat exceed the target), the UI flags it and `carbGrams` clamps to 0.
  - Round grams to whole numbers for display/storage; kcal to whole.

Exported helpers (names the plan will use): `ageFromBirthDate`, `computeTmb({formula, sex, weightKg, heightCm, age, bodyFatPercentage})`, `activityFactor(level)`, `computeGet(tmb, level)`, `suggestedCalories(get, objective)`, `computeMacros({targetCalories, weightKg, proteinGramsPerKg, fatPercent})` → `{ proteinGrams, proteinKcal, fatGrams, fatKcal, carbGrams, carbKcal }`.

## Data model (additive migration)

New enum `TmbFormula { MIFFLIN, HARRIS_BENEDICT, KATCH_MCARDLE }`.

New model `NutritionTarget`:
- `id` uuid, `patientId` + relation to `PatientProfile` (back-relation `nutritionTargets`), `targetDate DateTime @default(now())`, `createdAt DateTime @default(now())`.
- Input snapshot: `formula TmbFormula`, `sex Gender`, `age Int?`, `heightCm Float?`, `weightKg Float?`, `bodyFatPercentage Float?`, `activityLevel ActivityLevel?`, `activityFactor Float`.
- Computed: `tmb Float`, `get Float`.
- Chosen: `targetCalories Float`, `proteinGramsPerKg Float`, `proteinGrams Float`, `fatPercent Float`, `fatGrams Float`, `carbGrams Float`.
- `@@index([patientId, targetDate])`. No photo/PII beyond the patient link.

shared-types (`packages/shared-types/src/v1/nutrition-target.ts`): `TmbFormula` enum, `NutritionTarget` interface (dates ISO strings), `CreateNutritionTargetRequest` (the nutritionist's inputs + choices).

## API (`apps/api/src/patients/` — a `nutrition` module or under patients)

- `POST /v1/patients/:id/nutrition-targets` `@Roles(NUTRITIONIST)`: body carries the form inputs + choices (`formula`, optional `sex` override, optional `age/heightCm/weightKg/bodyFatPercentage` overrides, `activityLevel`, `targetCalories`, `proteinGramsPerKg`, `fatPercent`). The service derives any missing input from the patient + latest assessment, **recomputes** `tmb/get/activityFactor/proteinGrams/fatGrams/carbGrams` using the shared `energy.ts` (authoritative — never trusts client-computed numbers), persists a `NutritionTarget`, returns it. Ownership → 404. Katch with null `bodyFatPercentage` → server falls back to Mifflin (and records `formula: MIFFLIN`).
- `GET /v1/patients/:id/nutrition-targets` `@Roles(NUTRITIONIST)`: the patient's targets, `targetDate` desc.

## Web (`apps/web`)

New **"Metas"** tab on `patient-detail.tsx` (after "Bioimpedância"). A section that:
- Pre-fills inputs from the patient (`age` from birthDate, `sex` from gender, `height`, `weight` from the latest assessment, `activityLevel`, `objective`) — all editable via react-hook-form.
- Formula selector (Mifflin / Harris-Benedict / Katch-McArdle); Katch disabled when the latest assessment has no `bodyFatPercentage`.
- Shows **TMB** and **GET** live (computed via the shared `energy.ts`).
- Suggested **kcal target** (from GET + objective), editable.
- Macro inputs: `proteinGramsPerKg` and `fatPercent` → live grams + kcal breakdown + carbs remainder; warns if carbs < 0.
- **"Salvar meta"** → `POST` → the new target appears in a **history** list (date, kcal, P/C/G grams, formula).
- data-layer: `lib/api/nutrition-targets.ts` + `lib/queries/nutrition-targets.ts` (key `['nutrition-targets', id]`).

## Testing

- **shared-types calc** — exercised by the API **jest** suite (which imports `@nutri-plus/shared-types`): TMB per formula (known values), GET, suggested-calories per objective, macros (grams + carbs remainder, negative→clamp), Katch fallback when %GC null. shared-types `build` clean.
- **API:** nutrition-target service/controller spec — persists with server-recomputed values, derives missing inputs from patient/latest assessment, 404 on non-owned, Katch→Mifflin fallback recorded.
- **Web (vitest):** the Metas form computes TMB/GET/macros live, Katch is disabled without %GC, "Salvar meta" calls the create mutation, the history list renders. Update any `PatientDetail` fixture if a new tab needs it (no shape change expected).

## Constraints

- Additive migration on the shared dev DB (`prisma migrate dev`). shared-types rebuilt. NO new dependencies. pt-BR.
- Calc functions live in shared-types (pure, no deps) and are the single source used by web + API. Match file quote styles. API + mobile tests JEST / web vitest.
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push/PR. Branch `feat/nutrition-targets`.

## File map

- `packages/shared-types/src/v1/energy.ts` (new, pure calc) + `nutrition-target.ts` (new types) + `index.ts`
- `apps/api/prisma/schema.prisma` (+ `NutritionTarget`, `TmbFormula`, back-relation) + migration
- `apps/api/src/patients/nutrition/` (service + controller + DTO + spec) — or under an existing patients module
- `apps/web/src/lib/api/nutrition-targets.ts` + `lib/queries/nutrition-targets.ts`
- `apps/web/src/components/patients/nutrition-targets-section.tsx` (+ test) + a `Metas` tab in `patient-detail.tsx`
