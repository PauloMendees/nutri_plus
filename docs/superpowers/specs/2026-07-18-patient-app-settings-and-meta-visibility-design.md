# Patient-App Settings (defaults) + Patient Meta Visibility — Design

**Date:** 2026-07-18
**Branch:** `feat/nutrition-targets` (added onto the open PR #45 — same branch as the Metas/nutrition-targets feature)
**Status:** Approved design — ready for implementation plan

Bundled onto the Metas branch: (1) let the **patient** see their current nutrition target (kcal + macros) in the mobile app, gated by a per-patient opt-in; (2) refactor web **Configurações** into tabs and add an **"Aplicativo Paciente"** tab where the nutritionist sets **default** patient-app configs applied to newly-created patients.

## Decisions (from brainstorming)

- Patient sees the meta as a **card on the mobile evolution home** (`app/(app)/index.tsx`), showing **only kcal + macros (P/C/G)** — no clinical fields (TMB/GET/formula/factor).
- Defaults **only affect newly-created patients**; the per-patient value always wins and existing patients are untouched.
- The "Aplicativo Paciente" tab shows an **explanatory paragraph** (these are defaults for new patients, changeable per patient on the detail page) and a **tooltip on each setting**.

## Data model (additive migration)

- `PatientProfile` += `showMealTargetToPatient Boolean @default(false)` (per-patient meta visibility, parallel to `canLogAssessments`).
- `NutritionistProfile` += `defaultCanLogAssessments Boolean @default(false)` + `defaultShowMealTargetToPatient Boolean @default(false)`.

shared-types:
- `PatientSummary` (inherited by `PatientDetail`) += `showMealTargetToPatient: boolean`.
- `UpdatePatientRequest` += `showMealTargetToPatient?: boolean` (alongside the existing `canLogAssessments?`).
- `NutritionistSettings` += `defaultCanLogAssessments: boolean` + `defaultShowMealTargetToPatient: boolean`; `UpdateNutritionistSettingsRequest` += both (optional).
- New `MyNutritionTarget` type: `{ targetCalories: number; proteinGrams: number; carbGrams: number; fatGrams: number } | null` (the patient-safe subset).

## API

- **`createPatient`** (`patients.service.ts`): read the nutritionist's `defaultCanLogAssessments` + `defaultShowMealTargetToPatient` (from the resolved nutritionist profile) and create the new patient with `canLogAssessments` and `showMealTargetToPatient` = those defaults. This is the ONLY place defaults are applied (priority #1). (Today `canLogAssessments` just uses the Prisma default `false`; now it comes from the nutritionist default.)
- **`updatePatient`** (+ `UpdatePatientDto`): add `showMealTargetToPatient` (optional boolean) so the per-patient toggle persists (priority #2 — per-patient wins; a later change to the nutritionist default never rewrites existing patients).
- **Settings** (nutritionist): the settings GET response includes the two default booleans; `UpdateNutritionistSettingsDto` + PATCH accept them.
- **Patient-facing meta:** `GET /v1/me/nutrition-target` (patient-scoped, mirroring the `me/assessments` controller — reads `ctx.user.patientProfile`). Returns `MyNutritionTarget` — the **latest** `NutritionTarget`'s safe subset `{ targetCalories, proteinGrams, carbGrams, fatGrams }` when the patient's own `showMealTargetToPatient` is `true` AND a target exists, otherwise `null` (the response body is the object or `null`, no envelope). It NEVER returns `tmb`/`get`/`formula`/`activityFactor`/inputs. Implemented as a small patient-facing controller/method in the nutrition-targets module.

## Web

- **Settings tabs** (`settings-view.tsx`): wrap the page in shadcn `<Tabs>`:
  - **Plano alimentar** — the existing branding/logo/`displayName`/`mealPlanAiInstructions` section.
  - **Aparência** — the existing `<ThemeToggleSwitch />`.
  - **Aplicativo Paciente** (new):
    - An explanatory paragraph (pt-BR): *"Estas são configurações padrão aplicadas a novos pacientes. Você pode alterá-las individualmente na página de detalhes de cada paciente."*
    - Toggle **"Permitir registrar bioimpedância"** (`defaultCanLogAssessments`) with a tooltip: *"Se ligado, novos pacientes poderão registrar a própria bioimpedância pelo app."*
    - Toggle **"Mostrar a meta nutricional no app"** (`defaultShowMealTargetToPatient`) with a tooltip: *"Se ligado, novos pacientes verão a meta nutricional (calorias e macros) no app."*
    - Tooltips use the shadcn Tooltip pattern already used in `bioimpedance-section.tsx` (aliased `UiTooltip` + an info icon, `lucide-react` `Info`). Both save via the settings PATCH.
- **Patient detail** (`edit-patient-form.tsx`): add a `showMealTargetToPatient` toggle next to the existing `canLogAssessments` toggle — label **"Mostrar a meta nutricional no app do paciente"**, same toggle-button style. Persists via `updatePatient`.

## Mobile

- A **"Sua meta"** card on the evolution home (`app/(app)/index.tsx`): a new query hook `useMyNutritionTarget()` calls `GET /me/nutrition-target`. If it returns a target, render a card with kcal + macros (P/C/G) using friendly pt-BR labels (e.g. "Meta diária", "X kcal", "Proteína Xg", "Carboidrato Xg", "Gordura Xg"). If `null`, render nothing (no card). Placed near the top of the evolution screen.

## Testing

- **API (jest):** `createPatient` applies the nutritionist defaults to a new patient; `updatePatient` persists `showMealTargetToPatient`; settings PATCH updates the two defaults and GET returns them; `me/nutrition-target` returns the safe subset only when `showMealTargetToPatient` is true + a target exists, and `null` when hidden / no target — never leaking clinical fields.
- **shared-types:** `build` clean.
- **Web (vitest):** settings renders 3 tabs incl. "Aplicativo Paciente" with the explanatory text + the two tooltips; saving the defaults calls the settings mutation; `edit-patient-form` has the meta toggle and includes it in the update body. Update every `PatientSummary`/`PatientDetail` fixture with `showMealTargetToPatient` and every `NutritionistSettings` fixture with the two defaults.
- **Mobile (jest):** the "Sua meta" card renders when the endpoint returns a target and is absent when it returns `null`; `tsc` clean after the shared-type change (update any patient/settings fixtures the mobile app builds — likely none, verify).

## Constraints

- Additive migration on the shared dev DB. shared-types rebuilt. NO new dependencies. pt-BR.
- Adding required `showMealTargetToPatient` to `PatientSummary` + the two defaults to `NutritionistSettings` breaks strict-literal fixtures (web + possibly mobile) — update them (tsc will list them).
- The `me/nutrition-target` response is a strict patient-safe subset — no clinical fields ever.
- Match file quote styles. API + mobile tests JEST / web vitest. Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push/PR. Stay on `feat/nutrition-targets`.

## File map

- `apps/api/prisma/schema.prisma` (+ 3 boolean fields) + migration
- `packages/shared-types/src/v1/patient.ts` (PatientSummary + UpdatePatientRequest), `nutritionist-settings.ts` (2 defaults), `nutrition-target.ts` (MyNutritionTarget)
- `apps/api/src/patients/patients.service.ts` (createPatient defaults, updatePatient) + `dto/update-patient.dto.ts`
- `apps/api/src/nutritionist/**` settings service + DTO (the two defaults) — the existing settings module
- `apps/api/src/nutrition-targets/**` — patient-facing `me/nutrition-target` controller + service method
- `apps/web/src/components/settings/settings-view.tsx` (tabs + Aplicativo Paciente tab) + settings form/query
- `apps/web/src/components/patients/edit-patient-form.tsx` (meta toggle)
- `apps/mobile/lib/queries/*` (useMyNutritionTarget) + `apps/mobile/app/(app)/index.tsx` (Sua meta card)
- Fixtures + tests alongside each surface.
