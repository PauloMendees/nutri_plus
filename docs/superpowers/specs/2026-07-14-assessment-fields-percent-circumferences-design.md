# Assessment Fields: Muscle/Lean as % + Expanded Circumferences — Design

**Date:** 2026-07-14
**Branch:** `feat/plan-photo-ai-adjust-evolution-pdf` (extends open PR #39 — this edits files that only exist on that branch: `evolution-doc.ts`, the bioimpedance/evolution surfaces). Branch-vs-new-PR is the user's call at finish time (merge #39 first → fresh branch, or continue here).
**Status:** Approved design — ready for implementation plan

Nutritionist feedback, two of three items (the third — body-scan anthropometry —
is a separate future project, deliberately out of scope here):

1. Show **massa muscular** and **massa magra** as a **percentage**, replacing kg.
2. Expand the circumference set to: **Cintura, Abdômen, Quadril, Coxa medial,
   Braço relaxado, Braço contraído, Busto, Panturrilha.**

## Decisions (from brainstorming)

- **#1:** Percentage **replaces** kg in the UI. New `%` columns are added; the
  legacy kg columns are preserved (not dropped, not shown).
- **#2:** **Reuse + relabel + add** — keep the existing columns, relabel three,
  add three new columns.
- **Parity:** the patient's mobile self-log keeps the full field set (same as the
  nutritionist web form), matching today's behavior.

## ⚠️ Backward-compatibility constraint (drives the API design)

The patient app is **live on the App Store**. Its current `nova-medicao`
self-log posts `muscleMass`/`leanMass` (kg) to `POST /v1/me/assessments`, and the
API's global `ValidationPipe` runs `forbidNonWhitelisted` (unknown body keys →
400). Therefore the **API DTOs must stay additive**: they KEEP accepting
`muscleMass`/`leanMass` (so the live app doesn't start getting 400s) and ADD the
new fields. Only the *forms/validation/display* switch to `%`. The legacy kg
values that old-app users still send are written to the preserved kg columns and
simply not surfaced.

## A. Data model + migration (`apps/api/prisma/schema.prisma`, `BodyAssessment`)

Add 5 nullable columns (additive migration on the shared dev DB):

- `muscleMassPercentage Float?`
- `leanMassPercentage Float?`
- `abdomenCircumference Float?`
- `contractedArmCircumference Float?`
- `calfCircumference Float?`

Keep unchanged (data preserved): `muscleMass`, `leanMass` (kg, now UI-hidden) and
`waist/hip/chest/arm/thighCircumference` (chest/arm/thigh are **relabeled in the
UI only** — their DB column names stay). No renames, no drops.

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name assessment-percent-and-circumferences`.

## B. shared-types (`packages/shared-types/src/v1/assessment.ts`)

- `BodyAssessment`: add the 5 new fields (`number | null`); keep `muscleMass`/`leanMass` (legacy reads).
- `CreateAssessmentRequest`: add the 5 new fields (all optional); keep `muscleMass`/`leanMass` (backward compat). `UpdateAssessmentRequest = CreateAssessmentRequest` (unchanged alias).
- Rebuild: `pnpm --filter @nutri-plus/shared-types build`.

## C. API validation (`apps/api/src/patients/dto/`)

- `create-assessment.dto.ts` **only** (`update-assessment.dto.ts` is `export class UpdateAssessmentDto extends CreateAssessmentDto {}` — it inherits every validator, so no edit needed there): **ADD** `muscleMassPercentage`, `leanMassPercentage`, `abdomenCircumference`, `contractedArmCircumference`, `calfCircumference` — each `@IsOptional() @IsNumber() @Min(0)` (matching the existing `bodyFatPercentage`/`bodyWaterPercentage` rule; no upper bound, to stay consistent with today's % fields). **KEEP** `muscleMass`/`leanMass` (backward compat, do not remove).

## D. Entry forms — web + mobile (parity)

`apps/web/src/components/patients/assessment-dialog.tsx` and
`apps/mobile/app/(app)/nova-medicao.tsx` share the same field list/order. Update
both:

- Composition: replace `muscleMass` "Massa muscular (kg)" → `muscleMassPercentage`
  "Massa muscular (%)"; `leanMass` "Massa magra (kg)" → `leanMassPercentage`
  "Massa magra (%)". (weight, bodyFat %, visceralFat, BMR, water %, boneMass,
  metabolicAge unchanged.)
- Circumference block, in this order and with these labels:
  - `waistCircumference` — "Cintura (cm)"
  - `abdomenCircumference` — "Abdômen (cm)" (new)
  - `hipCircumference` — "Quadril (cm)"
  - `thighCircumference` — "Coxa medial (cm)" (relabel)
  - `armCircumference` — "Braço relaxado (cm)" (relabel)
  - `contractedArmCircumference` — "Braço contraído (cm)" (new)
  - `chestCircumference` — "Busto (cm)" (relabel)
  - `calfCircumference` — "Panturrilha (cm)" (new)
- Web zod (`apps/web/src/lib/validation/assessment.ts`): drop `muscleMass`/`leanMass`
  from `NUMERIC_KEYS` + the schema object; add the 5 new (`optNonNegative`). (The
  new form no longer collects kg; the API still accepts kg for old clients.)

## E. Display surfaces (ripple from the % switch + new measurements)

Legacy assessments that only have kg (no `%`) render "—"/insufficient for muscle
& lean — acceptable; new assessments carry the `%`.

- **Web `bioimpedance-section.tsx`:** the chartable `METRICS`, the `SUMMARY`
  cards, and the history-table "Músculo/Magra" columns read the `%` fields with
  "%" labels. The compact summary table is NOT widened to 8 circumference columns
  — the full circumference set lives in the PDF and the assessment editor.
- **Evolution PDF `apps/api/src/patients/pdf/evolution-doc.ts`:** `CHART_METRICS`
  and the composition table switch muscle/lean to the `%` fields (relabel
  "M.Musc"/"M.Magra" to indicate %); the circumference table lists the new
  8-measurement set with abbreviated headers (existing `fontSize: 8`).
- **Mobile `app/(app)/index.tsx`:** the snapshot tiles/trends use muscle `%`; the
  details grid uses the new circumference labels + the 3 new measurements.

## F. Testing

- API: update any assessment spec that constructs fixtures/asserts on
  `muscleMass`/`leanMass` so the new fields are covered; confirm the DTO still
  accepts kg (backward compat) and accepts the new fields.
- shared-types: `build` clean.
- Web: update `assessment-dialog.test.tsx` and `bioimpedance-section.test.tsx`
  (labels/values move to `%`), and `evolution-doc.spec.ts` (composition/circumference
  assertions).
- Mobile: update `index.test.tsx` and `nova-medicao.test.tsx` fixtures/labels.
- Keep all suites green: web test + `tsc --noEmit`; API test; mobile `tsc --noEmit` + test.

## Constraints

- NO new dependencies. pt-BR copy. Additive migration on the shared dev DB.
  shared-types rebuilt after edits. Match each file's quote style. Commit trailer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do not push/PR unless asked.
- **Do not remove `muscleMass`/`leanMass` from the DB or the API DTOs** (live-app
  backward compat + data preservation).

## File map

- `apps/api/prisma/schema.prisma` + migration — 5 new columns
- `packages/shared-types/src/v1/assessment.ts` — new fields on `BodyAssessment` + request types
- `apps/api/src/patients/dto/create-assessment.dto.ts` — add 5 new validators (UpdateAssessmentDto inherits)
- `apps/web/src/lib/validation/assessment.ts` — swap kg→% keys, add circumferences
- `apps/web/src/components/patients/assessment-dialog.tsx` — form fields/labels/order
- `apps/mobile/app/(app)/nova-medicao.tsx` — same field set (parity)
- `apps/web/src/components/patients/bioimpedance-section.tsx` — %-based metrics/summary/table
- `apps/api/src/patients/pdf/evolution-doc.ts` — %-based charts/table + new circumference columns
- `apps/mobile/app/(app)/index.tsx` — %-based tiles + new circumference grid rows
- Tests alongside each surface.
