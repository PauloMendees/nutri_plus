# Plan Editor + Patient Photo + AI Adjust + Evolution PDF — Design

**Date:** 2026-07-13
**Branch:** `feat/plan-photo-ai-adjust-evolution-pdf` (created off `main`)
**Status:** Approved design — ready for implementation plan

Four independent additions shipped on one branch. Each maps onto an existing
template already in the codebase; **no new dependencies** are introduced.

---

## Global Constraints (bind every part)

- **No new dependencies** (npm/expo). Everything reuses existing libs.
- **Quote style:** single quotes in all new/edited API + mobile files; in web,
  **match the file being edited** (web is mixed — `meal-plan-editor.tsx` uses
  double-quote JSX attrs + single-quote JS; most other web files use single
  quotes throughout).
- **pt-BR** for all user-facing copy.
- **Migrations are additive** and run on the shared dev DB with
  `pnpm --filter @nutri-plus/api exec prisma migrate dev --name <name>`.
- **shared-types** rebuilt after edits: `pnpm --filter @nutri-plus/shared-types build`.
- Supabase anon key stays client-only; AI output contains no medical claims.
- Never commit `.env` or `.expo/`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Keep suites green.** Verify per area:
  - API: `pnpm --filter @nutri-plus/api test`
  - shared-types: `pnpm --filter @nutri-plus/shared-types build`
  - web: `pnpm --filter @nutri-plus/web test`
  - mobile: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` AND `pnpm --filter @nutri-plus/mobile test`
- No new mobile routes are added → **no typedRoutes regen needed**.

**Suggested build order:** A → B → C → D. A/B/D are independent; C is
self-contained. Two additive migrations (`photoUrl` column;
`MEAL_PLAN_ADJUSTMENT` enum value) — may be one combined migration or two.

---

## Part A — Auto-grow text fields in the meal-plan editor (web only)

### Problem
Every free-text field in `apps/web/src/components/patients/meal-plan-editor.tsx`
is a shadcn `Input` (`apps/web/src/components/ui/input.tsx`, fixed `h-8`), which
truncates long text horizontally. The `instructions` field is the exception: it
already uses shadcn `Textarea` (`apps/web/src/components/ui/textarea.tsx`), which
**auto-grows natively** via the Tailwind class `field-sizing-content` (CSS
`field-sizing: content`) + `min-h-16` — no JS, no library.

### Approach
Swap the truncating free-text `Input`s for `Textarea` with `rows={1}` and a
tightened `min-h` (start one line tall, grow with content). The react-hook-form
`register(...)` spread supplies `ref/name/onChange/onBlur` and works unchanged on
`<textarea>` — no `Controller` migration.

**Fields converted** (exact locations in `meal-plan-editor.tsx`):
- Plan title (L218), plan objective (L219)
- Meal name (L341, keep `max-w-48`), meal timeLabel (L342, keep `max-w-28`)
- Option label (L412–417, keep `max-w-40`)
- Item foodName (L439), item quantity (L440, keep `w-20`)

**Left as-is:** numeric fields — targets (L229) and item macros (L443–444) stay
`Input type="number"`; `instructions` (L352) is already a `Textarea`.

### Details / constraints
- Preserve every existing `aria-label` and `id` — tests and a11y depend on them
  (`Alimento`, `Quantidade`, `Nome da refeição`, `Horário`, `Rótulo da opção`,
  `Objetivo`, plus `mp-title` etc.).
- Keep the `max-w-*` / `w-*` column widths so the food-item table layout stays
  intact; text wraps within the column and the field grows vertically.
- The shadcn `Textarea` default `min-h-16` is too tall for inline cells — apply a
  className (e.g. `min-h-0` + a height that matches the current `h-8`/`h-7`
  baseline) so fields start compact and grow. This may warrant a tiny local
  wrapper or a shared className constant to DRY the ~7 usages.
- Zod max-lengths unchanged (`apps/web/src/lib/validation/meal-plan.ts`:
  title 200, objective 500, name 200, timeLabel 100, label 200, foodName 200,
  quantity 100).

### Testing
- `apps/web/src/components/patients/meal-plan-editor.test.tsx` (18 tests) must
  stay green — its `getByLabelText` / `getByDisplayValue` queries work on
  `<textarea>`.
- Add one assertion that a long foodName value renders in full (a `<textarea>`
  with the full value), guarding against regression to a truncating `<input>`.

---

## Part B — Patient profile photo

Exact end-to-end template exists: the **nutritionist-logo** upload. Mirror it.

### Data model
- `apps/api/prisma/schema.prisma` `PatientProfile` (L94–123): add
  `photoUrl String?`. Additive migration. (Precedent: `NutritionistProfile.logoUrl String?` L69.)
- shared-types `packages/shared-types/src/v1/patient.ts`: add
  `photoUrl: string | null` to `PatientSummary` (L32–49). Inherited by
  `PatientDetail`; flows to both list and detail responses automatically (the
  service `include` selects scalar fields, so no service change is needed to
  return it — but the type must declare it).

### Storage
- New **public** bucket `patient-photos`, object key `${patientId}.${ext}`.
- Reuse `apps/api/src/supabase/supabase-admin.service.ts`:
  `uploadPublicObject(bucket, path, buffer, contentType)` (L92–114, returns
  public URL) and `removeObject(bucket, path)` (L118–124).
- `PatientsModule` already imports `SupabaseAdminModule` and `PatientsService`
  already injects `SupabaseAdminService` → **zero new wiring**.

### API (`apps/api/src/patients/`)
On `patients.controller.ts` (`@Controller({ path: 'patients', version: '1' })`).
**Roles: match the existing `PATCH /v1/patients/:id` update endpoint** (which is
`@Roles(NUTRITIONIST)` — the controller default; `list`/`findOne` are the only
methods that add `EMPLOYEE`). Photo upload/delete are mutations, so keep them at
the same role as `update`:
- `POST /v1/patients/:id/photo` — `@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2MB } }))`
  + `@UploadedFile(new ParseFilePipe({ validators: [MaxFileSizeValidator 2MB, FileTypeValidator /^image\/(png|jpe?g|webp)$/] }))`.
- `DELETE /v1/patients/:id/photo`.

On `patients.service.ts`:
- `uploadPhoto(ctx, id, { buffer, mimetype })`: `requireOwned`, magic-byte image
  check (copy `isSupportedImage` from `nutritionist-settings.service.ts` L22–30),
  `uploadPublicObject('patient-photos', \`${id}.${ext}\`, ...)`, persist
  `photoUrl`, return updated patient (`include: { user: USER_SUMMARY }`).
- `removePhoto(ctx, id)`: `requireOwned`, `removeObject`, null the column.
- `EXT_BY_MIME` map (copy from `nutritionist-settings.service.ts` L10–14).

Mirrors `uploadLogo`/`removeLogo` in
`apps/api/src/nutritionist-settings/nutritionist-settings.service.ts`
(controller L46–66, service L57–91).

### Web
- `apps/web/src/lib/api/patients.ts`: `uploadPatientPhoto(id, file)` via
  `browserApiUpload('/patients/${id}/photo', formData)` (append `'file'`);
  `deletePatientPhoto(id)` DELETE. (Precedent: `lib/api/settings.ts`
  `uploadLogo`/`deleteLogo`.)
- `apps/web/src/lib/queries/patients.ts`: `useUploadPatientPhoto(id)` /
  `useDeletePatientPhoto(id)` — invalidate `['patients']`, `setQueryData(['patient', id], ...)`.
- New `PatientAvatar` component: `<img src={photoUrl}>` with an
  `initials(name)` fallback (the existing `initials()` helper in
  `patients-list.tsx` L15–18), used in all three render spots to DRY:
  - `apps/web/src/components/patients/patients-list.tsx` — mobile card
    (L115–117) + desktop table cell (L144–146). Bump avatar to `size-9/10`;
    row height may grow accordingly (allowed).
  - `apps/web/src/components/patients/patient-detail.tsx` — header card
    (L57–68), plus the upload/remove control (copy the logo control from
    `apps/web/src/components/settings/settings-view.tsx` L116–155: hidden
    `<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only">`
    behind a styled `<label>`, preview img/initials, "Remover" button; reset
    `fileRef.current.value` in `finally`). Show the control only when the
    nutritionist can manage patients.

### Testing
- API spec (mirror `nutritionist-settings` tests): upload persists `photoUrl` to
  the right bucket/key; delete nulls it; non-owned → 404; oversized / wrong-type
  rejected.
- Web: `PatientAvatar` shows `<img>` when `photoUrl` set, initials when null;
  upload control calls the mutation; list + detail render the avatar.

---

## Part C — "Solicitar ajustes" to the AI (draft → review → save)

**Chosen flow:** the AI returns a **draft that is NOT persisted**; the web loads
it into the editor form for review; the nutritionist clicks the existing
**Salvar** to commit (via the existing `updatePlan`). Reuses the editor as the
preview surface; never silently overwrites a hand-edited plan; adds no
version/history concept.

### Audit enum
- `apps/api/prisma/schema.prisma` `AIInteractionType` (L257–260): add
  `MEAL_PLAN_ADJUSTMENT`. Additive migration.

### Prompt
- New `apps/api/src/ai/prompts/meal-plan-adjustment.prompt.ts` following the
  `meal-plan.prompt.ts` pattern: export `MEAL_PLAN_ADJUSTMENT_SYSTEM_PROMPT`
  (array `.join(' ')`, pt-BR: revise the given plan honoring the nutritionist's
  request + patient constraints + targets, no medical claims) and
  `buildMealPlanAdjustmentUserPrompt(ctx)` returning `JSON.stringify(ctx)`, where
  `ctx` = current plan tree (serialized meals/options/items), patient constraints
  (objective, restrictions, allergies, medicalConditions, notes), server targets
  (existing plan `targetCalories/Protein/Carbs/Fats`), and the free-text
  `instructions`. Declare the `*PromptContext` interface locally (avoid cycles).

### API (`apps/api/src/meal-generation/`)
On `meal-generation.controller.ts` (`@Controller({ path: 'ai', version: '1' })`,
`@Roles(UserRole.NUTRITIONIST)`):
- `POST /v1/ai/adjust-meal-plan`, body `AdjustMealPlanDto { planId @IsUUID,
  instructions @IsString @IsNotEmpty @MaxLength(2000) }` →
  `mealGeneration.adjust(ctx, dto.planId, dto.instructions)`.

`MealGenerationService.adjust(ctx, planId, instructions)`:
- Load the owned plan via `mealPlans.getPlan(ctx, planId)` (returns 404 if
  missing/not-owned — no existence leak). `getPlan` returns the plan tree but
  **not** the patient's clinical profile.
- Load the patient profile separately by `plan.patientId` (objective,
  restrictions, allergies, medicalConditions, notes) — mirror how
  `MealGenerationService.generate` fetches the profile — and build the prompt
  context from the plan tree + that profile.
- `provider.generateStructured<MealPlanResponse>({ tier: 'smart',
  system: MEAL_PLAN_ADJUSTMENT_SYSTEM_PROMPT, user: buildMealPlanAdjustmentUserPrompt(ctx),
  schema: mealPlanResponseSchema, schemaName: 'meal_plan',
  type: AIInteractionType.MEAL_PLAN_ADJUSTMENT, patientId: plan.patientId })`.
- **Return the draft without persisting**: `{ title, objective, targetCalories,
  targetProtein, targetCarbs, targetFats, meals }` — carry the existing plan's
  targets/objective through so the editor keeps them. Server still owns `order`
  (from array index) and never trusts client ordering; `aiGenerated` is not part
  of a draft.

Reuses `mealPlanResponseSchema` from
`apps/api/src/meal-generation/schema/meal-plan-response.schema.ts` (title +
meals[name,timeLabel,options[label,items[foodName,quantity,calories,protein,carbs,fats]]]).

### shared-types
- `packages/shared-types/src/v1/meal-plan.ts`: `AdjustMealPlanRequest { planId: string; instructions: string }`
  and a `MealPlanDraft` response type (`title?`, `objective?`, `target*?`,
  `meals: MealInput[]`) — shaped to feed the web editor's form values.

### Web
- `apps/web/src/lib/api/meal-plans.ts`: `adjustMealPlan(planId, instructions)` →
  `POST /ai/adjust-meal-plan` returns `MealPlanDraft`.
- `apps/web/src/lib/queries/meal-plans.ts`: `useAdjustMealPlan(planId)` — plain
  mutation; **no cache invalidation** (nothing persisted).
- In `meal-plan-editor.tsx`: a "Solicitar ajustes à IA" button (shown on a
  saved, editable plan — `!isCreate && canEdit`) opens a free-text dialog
  mirroring `apps/web/src/components/patients/ai-generate-dialog.tsx`
  (`Textarea maxLength={2000}`, submit disabled when empty). On success:
  `form.reset(draftToFormValues(draft))` to replace the current fields, and toast
  "Plano ajustado — revise e salve". The nutritionist reviews and clicks the
  existing "Salvar".

### Testing
- API spec: `adjust` builds context from plan + patient, calls the provider
  (mocked) with `type: MEAL_PLAN_ADJUSTMENT`, returns the draft, **does not write
  to the DB** (assert no create/update), non-owned plan → 404.
- Web: dialog submit repopulates the form with the returned draft; a subsequent
  save calls `updateMealPlan`.

---

## Part D — Patient evolution PDF (charts + full table)

Reuses the `pdfmake` infra behind the meal-plan PDF. Charts are drawn as pdfmake
**`canvas` polylines** (porting the min/max→pixel scaling already in the mobile
chart) — **no charting/image dependency**.

### Library facts (from `apps/api/src/meal-plans/pdf/`)
- `pdf-printer.ts`: `renderPdf(doc: TDocumentDefinitions): Promise<Buffer>`
  (module-level `PdfPrinter`, Roboto vfs). Reuse as-is.
- `meal-plan-doc.ts`: shows the node vocabulary in use — `{ image: dataUrl, fit }`
  for the logo, `{ canvas: [...] }` for vector lines, styled tables with
  `widths`/`layout`, `styles`, `footer`.
- `meal-plan-pdf.service.ts`: `build()` fetches `NutritionistProfile { displayName, logoUrl }`,
  converts the logo via `fetchLogo(url)` → `data:${ct};base64,...` (best-effort,
  null on failure), then `renderPdf`. Returns a `Buffer`; controllers wrap in
  `StreamableFile`.

### Content
- **Trend charts** for **weight, bodyFatPercentage, muscleMass, leanMass** (key
  metrics). A metric with <2 non-null points renders a "dados insuficientes"
  note instead of a chart. Brand teal `#14BFA6` line.
- **Full history table**: one row per assessment (the doc builder normalizes to
  **ascending** by `assessmentDate` regardless of the source order — the
  nutritionist `listAssessments` returns desc, the patient path returns asc),
  columns for date + every metric on `BodyAssessment`
  (weight, bodyFatPercentage, muscleMass, leanMass, visceralFat,
  basalMetabolicRate, bodyWaterPercentage, boneMass, metabolicAge,
  waist/hip/chest/arm/thighCircumference) + **BMI** computed from
  `PatientProfile.height` (`weight / (height/100)^2`, same as mobile `bmi()`).
  Wide table → paginate / group columns as needed for readability.
- Branded header (displayName + logo) like the meal-plan PDF, plus patient name
  and the date range covered.

### Data model / access (already present)
- `BodyAssessment` (`schema.prisma` L160–187) — all metric fields, immutable
  history, `@@index([patientId, assessmentDate])`. BMI is not stored (computed).
- Nutritionist: `PatientsService.listAssessments(ctx, id)` (`patients.service.ts`
  L128–137, owned, desc). Patient: `listMyAssessments(ctx)` (L166–178, returns
  `{ name, height, assessments (asc), canLog }`).
- shared-types `assessment.ts`: `BodyAssessment`, `MyEvolutionResponse`.

### API (`apps/api/src/patients/pdf/` — new, mirrors `meal-plans/pdf/`)
- `evolution-doc.ts`: `buildEvolutionDocDefinition({ patientName, height, assessments, branding }): TDocumentDefinitions`,
  with a `drawChart(series, opts)` helper returning a `{ canvas: [...] }` node
  (polyline for the trend, lines for axes/gridlines, ellipses for points, text
  labels). Port scaling from `apps/mobile/components/chart/line-chart.tsx`
  (`px()/py()`, flat-series padding).
- `evolution-pdf.service.ts`:
  - `generate(ctx, patientId)` [nutritionist: `listAssessments` +
    `resolveScopeNutritionistId` branding].
  - `generateForPatient(ctx)` [patient: `listMyAssessments` for name/height/
    assessments, branding via the patient's `nutritionistId`].
  - Both call `renderPdf`. Mirror `meal-plan-pdf.service.ts` structure incl.
    `fetchLogo` best-effort.
- Endpoints, both returning `StreamableFile` (`filename="evolucao.pdf"`):
  - `GET /v1/patients/:id/assessments/pdf` on `patients.controller.ts`
    (`@Roles(NUTRITIONIST, EMPLOYEE)`).
  - `GET /v1/me/assessments/pdf` on
    `apps/api/src/patients/patient-assessments.controller.ts` (`@Roles(PATIENT)`).

### Web (nutritionist)
- `apps/web/src/lib/api/assessments.ts`: `downloadAssessmentsPdf(patientId)` via
  `browserApiDownload('/patients/${patientId}/assessments/pdf')` (Blob →
  anchor-click download, mirror `downloadMealPlanPdf`).
- "Exportar PDF" button in the
  `apps/web/src/components/patients/bioimpedance-section.tsx` header (near "Nova
  avaliação", L96–103). Disabled when there are no assessments.

### Mobile (patient)
- `apps/mobile/lib/queries/assessments.ts`: `downloadEvolutionPdf()` copying the
  exact pattern from `apps/mobile/lib/queries/meal-plans.ts:27–40`:
  `supabase.auth.getSession()` → token; `url = \`${EXPO_PUBLIC_API_URL}/v1/me/assessments/pdf\``;
  `FileSystem.downloadAsync(url, \`${FileSystem.cacheDirectory}evolucao.pdf\`, { headers: { Authorization: \`Bearer ${token}\` } })`
  then `Sharing.shareAsync`. **Critical:** import
  `* as FileSystem from 'expo-file-system/legacy'` (SDK-54 top-level
  `downloadAsync` is a throwing deprecation shim). `* as Sharing from 'expo-sharing'`.
- "Exportar PDF" button on the Evolução screen `apps/mobile/app/(app)/index.tsx`
  (button UI mirrors `components/meal-plan/meal-plan-view.tsx` `onDownload` with
  `downloading`/`pdfError` state). Disabled when there are no assessments.

### Testing
- API: `evolution-doc` produces chart `canvas` nodes + table rows + a branding
  image node only when a logo data-URL is given; service resolves branding on
  both nutritionist and patient paths; non-owned → 404; empty-assessments
  tolerance. (Mirror `meal-plan-pdf.service.spec.ts` + `meal-plan-doc.spec.ts`,
  incl. RGB-PNG-only caveat if any raster is embedded.)
- Web: button triggers `downloadAssessmentsPdf`.
- Mobile: button triggers download + share (expo-file-system/expo-sharing
  mocked); disabled when no data.

---

## File map (created / modified)

**API**
- `apps/api/prisma/schema.prisma` — `photoUrl` on PatientProfile; `MEAL_PLAN_ADJUSTMENT` enum
- `apps/api/prisma/migrations/**` — additive migration(s)
- `apps/api/src/patients/patients.controller.ts` — photo POST/DELETE; evolution PDF GET
- `apps/api/src/patients/patients.service.ts` — uploadPhoto/removePhoto
- `apps/api/src/patients/dto/*` — (photo has no body DTO; multipart)
- `apps/api/src/patients/patient-assessments.controller.ts` — `/me/assessments/pdf`
- `apps/api/src/patients/pdf/evolution-doc.ts` (new), `evolution-pdf.service.ts` (new)
- `apps/api/src/patients/patients.module.ts` — wire evolution PDF service
- `apps/api/src/meal-generation/meal-generation.controller.ts` — adjust endpoint
- `apps/api/src/meal-generation/meal-generation.service.ts` — `adjust(...)`
- `apps/api/src/meal-generation/dto/adjust-meal-plan.dto.ts` (new)
- `apps/api/src/ai/prompts/meal-plan-adjustment.prompt.ts` (new)
- API specs alongside each

**shared-types**
- `packages/shared-types/src/v1/patient.ts` — `photoUrl`
- `packages/shared-types/src/v1/meal-plan.ts` — `AdjustMealPlanRequest`, `MealPlanDraft`

**Web**
- `apps/web/src/components/patients/meal-plan-editor.tsx` — Input→Textarea swaps; adjust button + dialog
- `apps/web/src/components/patients/ai-generate-dialog.tsx` — pattern reference (may extract a shared free-text dialog)
- `apps/web/src/components/patients/patient-avatar.tsx` (new)
- `apps/web/src/components/patients/patients-list.tsx`, `patient-detail.tsx` — avatar + upload control
- `apps/web/src/lib/api/patients.ts`, `lib/queries/patients.ts` — photo endpoints/hooks
- `apps/web/src/lib/api/meal-plans.ts`, `lib/queries/meal-plans.ts` — adjust endpoint/hook
- `apps/web/src/lib/api/assessments.ts` — evolution PDF download
- `apps/web/src/components/patients/bioimpedance-section.tsx` — export button
- Web tests alongside each

**Mobile**
- `apps/mobile/lib/queries/assessments.ts` — `downloadEvolutionPdf`
- `apps/mobile/app/(app)/index.tsx` — export button
- Mobile tests alongside
