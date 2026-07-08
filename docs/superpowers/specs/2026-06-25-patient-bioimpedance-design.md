# Patient bioimpedance (Bioimpedância) — Design

**Date:** 2026-06-25
**Status:** Approved (pending implementation plan)
**Scope:** The patient bioimpedance feature: view a patient's body-assessment history (summary cards + a trend chart with a metric selector + a compact history table), add a new assessment, and edit/delete existing ones. Adds the two missing backend endpoints (`PATCH`/`DELETE` assessment) and the entire web layer over the existing `BodyAssessment` model. Employees are read-only (they may view assessments but not create/edit/delete), consistent with the patient-permissions model.
**Builds on:** the existing assessments API (`POST`/`GET /v1/patients/:id/assessments`, the `BodyAssessment` Prisma model, `CreateAssessmentDto`) and the patient detail page's `canEdit` prop + `getCurrentUser` (from PR #18). New branch `feat/patient-bioimpedance`, stacked on `feat/employees-ui` (PR #18) because it depends on that `canEdit` plumbing.

---

## 1. Goal

On a patient's detail page, a nutritionist can record bioimpedance assessments over time and see the patient's evolution; an employee can view that history but not change it. Done when: the "Em breve" placeholder is replaced by a section showing the latest assessment as summary cards, a trend line chart with a metric selector, and a compact history table; "Nova avaliação" opens a dialog to create one; each history row can be edited or deleted (nutritionist only); and an employee sees the same summary/chart/table with no create/edit/delete affordances.

## 2. Context: what already exists

- **Prisma `BodyAssessment`**: `id`, `patientId`, `assessmentDate` (defaults `now()`), and all-optional metrics — `weight`, `bodyFatPercentage`, `muscleMass`, `leanMass`, `visceralFat`, `basalMetabolicRate`, `bodyWaterPercentage`, `boneMass`, `metabolicAge` (int), `waistCircumference`, `hipCircumference`, `chestCircumference`, `armCircumference`, `thighCircumference`, `notes` (≤2000), `createdAt`.
- **API** (`PatientsController`, default `@Roles(NUTRITIONIST)`): `POST /v1/patients/:id/assessments` (`CreateAssessmentDto`) — nutritionist only; `GET /v1/patients/:id/assessments` — `@Roles(NUTRITIONIST, EMPLOYEE)`, returns all assessments `desc` by `assessmentDate`. Service `createAssessment`/`listAssessments` use `requireOwned(ctx, patientId)` for tenancy.
- **Web**: `BioimpedanceSection` is a static "Em breve" placeholder; `PatientDetail` renders it and already receives `canEdit`; `PatientDetail.assessments` is typed `unknown[]`. No chart library is installed.

This slice is **mostly frontend over a ready API**, plus the two write endpoints the chosen scope (edit/delete) requires.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Scope | Full: history + create form + **trend charts** + **edit/delete**. |
| Edit/delete | New backend `PATCH` and `DELETE` assessment endpoints (nutritionist only). |
| Charts | **Recharts** (added to `apps/web`) — one line chart with a **metric selector** (chips). |
| Section layout | **Summary cards (latest) → trend chart → compact history table** (the approved "layout B"). |
| Create/edit form | A single **`AssessmentDialog`** (modal), reused for create and edit; inline-confirm "Excluir" in edit mode. Matches the app's dialog pattern. |
| Permissions | Employee = read-only: summary/chart/table visible (API allows `GET`), no create/edit/delete affordances. Gated by the `canEdit` prop already on `PatientDetail`. |
| Branch | `feat/patient-bioimpedance`, stacked on `feat/employees-ui`. |

## 4. Backend — `PATCH` + `DELETE` assessment (`apps/api/src/patients`)

Mirror the existing `createAssessment`/`removeEmployee` patterns.

- **DTO** `update-assessment.dto.ts`: `UpdateAssessmentDto` — identical fields/validators to `CreateAssessmentDto` (all optional; same `@IsPositive`/`@Min(0)`/`@MaxDate`/`@MaxLength` rules).
- **Service** (`patients.service.ts`):
  - `updateAssessment(ctx, patientId, assessmentId, dto)`: `requireOwned(ctx, patientId)` → `findFirst` the assessment `where { id: assessmentId, patientId }` → `404` (`NotFoundException`) if absent → `bodyAssessment.update({ where: { id: assessmentId }, data: dto })`.
  - `removeAssessment(ctx, patientId, assessmentId)`: same ownership + existence check → `bodyAssessment.delete`. Returns `void`.
- **Controller** (`patients.controller.ts`): `@Patch(':id/assessments/:assessmentId')` → `updateAssessment`; `@Delete(':id/assessments/:assessmentId')` `@HttpCode(204)` → `removeAssessment`. Both inherit the controller-level `@Roles(NUTRITIONIST)` (no per-method override), so employees are blocked. `GET`/`POST` unchanged.
- Tenancy: a non-owned patient or an `assessmentId` that doesn't belong to the patient both yield `404`, never leaking existence.

## 5. shared-types (`packages/shared-types/src/v1`)

- New `assessment.ts`:
  - `BodyAssessment { id: string; patientId: string; assessmentDate: string; weight: number | null; bodyFatPercentage: number | null; muscleMass: number | null; leanMass: number | null; visceralFat: number | null; basalMetabolicRate: number | null; bodyWaterPercentage: number | null; boneMass: number | null; metabolicAge: number | null; waistCircumference: number | null; hipCircumference: number | null; chestCircumference: number | null; armCircumference: number | null; thighCircumference: number | null; notes: string | null; createdAt: string }` (dates ISO strings).
  - `CreateAssessmentRequest`: `assessmentDate?: string` + every metric optional (`number`) + `notes?: string`.
  - `UpdateAssessmentRequest`: same shape as `CreateAssessmentRequest` (all optional). Export from `index.ts`.
- `patient.ts`: change `PatientDetail.assessments` from `unknown[]` to `BodyAssessment[]`. Rebuild the package.

## 6. Web — data layer

- `lib/api/assessments.ts` (via `browserApiFetch`): `listAssessments(patientId): Promise<BodyAssessment[]>` (GET `/patients/:id/assessments`); `createAssessment(patientId, body): Promise<BodyAssessment>` (POST); `updateAssessment(patientId, id, body): Promise<BodyAssessment>` (PATCH `/patients/:id/assessments/:assessmentId`); `deleteAssessment(patientId, id): Promise<void>` (DELETE).
- `lib/queries/assessments.ts`: `useAssessments(patientId)` (key `['assessments', patientId]`); `useCreateAssessment(patientId)`, `useUpdateAssessment(patientId)` (mutationFn `{ id, body }`), `useDeleteAssessment(patientId)` (mutationFn `id`). All mutations invalidate `['assessments', patientId]`.
- `lib/validation/assessment.ts`: `assessmentSchema` — `assessmentDate` optional, must not be future (reuse the patient validation's date refine); each metric optional via the existing `emptyToUndefined` + `z.coerce.number()` pattern (positive where the DTO requires it: `weight`, `basalMetabolicRate`; `≥ 0` otherwise; `metabolicAge` integer); `notes` optional ≤ 2000; a top-level `.refine` requiring **at least one numeric metric** to be present (the 15 measurable fields; `assessmentDate` and `notes` alone do not satisfy it, so an otherwise-empty assessment can't be saved), pt-BR message. Export `AssessmentValues`. Used for both create and edit.

## 7. Web — UI (`apps/web/src/components/patients`)

`BioimpedanceSection` (replaces the placeholder), `canEdit: boolean` prop forwarded from `PatientDetail`:

- Fetches `useAssessments(patient.id)`. States: loading (skeleton), error (+ retry), empty ("Nenhuma avaliação ainda" + a "Registrar avaliação" CTA when `canEdit`).
- **Header:** "Bioimpedância" + a "Nova avaliação" button (only when `canEdit`).
- **Summary cards:** key metrics of the most recent assessment (`assessments[0]`) — peso, % gordura, massa magra, TMB — each card shows the value or "—".
- **Trend chart:** a Recharts `LineChart` in a `ResponsiveContainer`, plotting the selected metric across assessments in chronological (ascending) order; a chip row selects the metric (peso, % gordura, massa muscular, massa magra, cintura, …); axis by `assessmentDate` (`dd/MM`); tooltip; line uses the theme primary (`#14BFA6`). Hidden/empty-stated when fewer than 2 data points for the metric.
- **History table:** compact table (`Data`, `Peso`, `% Gord.`, `Músculo`, `Cintura`, …) of all assessments, desc. When `canEdit`, each row has Editar/Excluir actions (an "⋯"/buttons) that open the dialog / inline-confirm.
- A small number-formatting helper (pt-BR, `—` for null) lives in the section or a tiny `lib/patients/assessment-format.ts`.

`AssessmentDialog` (`assessment-dialog.tsx`), modeled on `category-dialog.tsx`/`employee-dialog.tsx`:
- Props `{ open, onOpenChange, patientId, assessment? }`. Create when `assessment` absent; edit when present.
- react-hook-form + `assessmentSchema`. Fields grouped: **Data** (`assessmentDate`, date input, defaults today), **Composição corporal** (weight, bodyFatPercentage, muscleMass, leanMass, visceralFat, basalMetabolicRate, bodyWaterPercentage, boneMass, metabolicAge), **Circunferências** (waist/hip/chest/arm/thigh), **Notas** (textarea). Scrollable content.
- Submit → `createAssessment` / `updateAssessment({ id, body })` → toast + close + invalidate. Edit footer has an "Excluir" button → inline confirm ("Excluir esta avaliação? Esta ação não pode ser desfeita." → Cancelar / Excluir) → `deleteAssessment`. Buttons disabled while pending. `ApiError` → friendly pt-BR.

`Recharts` is added to `apps/web` `package.json`.

## 8. Permissions

`canEdit` (already `canManagePatients(role)` on `PatientDetail`) gates every write affordance: the "Nova avaliação" button, the empty-state CTA, and the per-row Editar/Excluir. An employee (`canEdit=false`) sees the summary cards, chart, and table — all read-only. The API independently enforces this (`PATCH`/`DELETE`/`POST` are nutritionist-only); the UI only avoids dead affordances.

## 9. Error handling

Forms: inline zod messages (pt-BR) + the "ao menos uma métrica" refine. API errors via `err instanceof ApiError` → friendly pt-BR (generic save/delete failure). Mutations disable their buttons while pending and invalidate `['assessments', patientId]`. List: loading skeleton, empty (with/without create CTA), error + retry.

## 10. Testing

- **API (Jest, `patients.service.spec.ts`):** `updateAssessment` — updates fields, scoped to the nutritionist, `404` for a non-owned patient and for an `assessmentId` not belonging to the patient; `removeAssessment` — deletes when owned, `404` otherwise (and does not delete on the 404 path). `UpdateAssessmentDto` mirrors `CreateAssessmentDto` (no bespoke DTO test, per repo convention).
- **Web (Vitest + RTL):** assessments API funcs (paths/methods/bodies); `assessmentSchema` (accepts a valid metric, rejects an all-empty payload, rejects a future date); `BioimpedanceSection` (loading/empty/error; summary from latest; metric-selector switches the charted series; table renders rows; `canEdit=false` hides Nova avaliação + row actions; `canEdit=true` shows them); `AssessmentDialog` (create calls `createAssessment`; edit prefilled + `updateAssessment` with the id; delete inline-confirm → `deleteAssessment`). **Recharts is mocked** (its chart components render simple placeholders) to avoid SVG/`ResponsiveContainer` resize issues under jsdom.

## 11. Out of scope (YAGNI)

Cross-patient comparison; PDF/CSV export; per-metric goals/targets and alerting; computed indices (BMI, waist-hip ratio) beyond what's stored; the patient-facing mobile app; assessment attachments/photos.
