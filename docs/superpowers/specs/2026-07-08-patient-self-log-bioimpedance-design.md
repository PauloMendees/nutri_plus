# Patient Self-Logging of Bioimpedance (nutritionist-gated) — Design

**Date:** 2026-07-08
**Status:** Approved (design), pending spec review

## Goal

Let a nutritionist decide, per patient, whether that patient may add their own
bioimpedance (body assessment) entries from the mobile app. When enabled, the
app shows a form with the **exact same fields as the web** nutritionist form.
When disabled, the feature is **100% hidden** in the app.

## Decisions (from brainstorming)

- **Scope:** patient may only **add** new measurements. Editing/deleting stays
  nutritionist-only on web (preserves clinical history, smallest surface).
- **Toggle location:** a switch in the web **patient edit form**.
- **Default:** `canLogAssessments` defaults to **false** (opt-in per patient).
- **Gate delivery:** the flag rides along in `GET /me/assessments`
  (`MyEvolutionResponse.canLog`) — the screen already fetches it, so no extra
  request and no new mobile session plumbing.
- **Defense in depth:** the UI hides the feature when off, **and** the API
  rejects `POST /me/assessments` with 403 when off.

## Out of scope (v1)

- Patient editing or deleting their own entries (nutritionist does this on web).
- Any change to the nutritionist assessment surface (`/patients/:id/assessments`).
- Notifications/reminders to log.

---

## 1. Data model (`apps/api/prisma/schema.prisma`) — additive migration

Add one field to `model PatientProfile`:

```prisma
  canLogAssessments Boolean @default(false)
```

Additive migration on the shared dev DB (`prisma migrate dev --name ...`).
`BodyAssessment` is unchanged.

## 2. shared-types (`packages/shared-types/src/v1`)

- `assessment.ts` → add to `MyEvolutionResponse`:
  ```ts
  canLog: boolean;
  ```
- Patient types (`patient.ts` or wherever `Patient` / `UpdatePatientRequest`
  live): add `canLogAssessments: boolean` to the patient detail type and
  `canLogAssessments?: boolean` to the update request type.

Build with `pnpm --filter @nutri-plus/shared-types build`.

## 3. API (`apps/api/src/patients`)

### 3a. Nutritionist sets the flag
- `dto/update-patient.dto.ts`: add
  ```ts
  @IsOptional()
  @IsBoolean()
  canLogAssessments?: boolean;
  ```
  The nutritionist sets it via the existing `PATCH /patients/:id`
  (`PatientsService.update` already does `data: dto`). The patient-detail GET
  returns all scalar fields (no restrictive `select`), so `canLogAssessments` is
  already included for the web form to prefill.

> **Gate availability (verified):** the auth user loader uses
> `patientProfile: true` (`apps/api/src/users/users.service.ts:27`), which loads
> every scalar field. So after the migration + `prisma generate`,
> `ctx.user.patientProfile.canLogAssessments` is available on the AuthContext
> automatically — no select/loader changes needed for the gate.

### 3b. Patient adds an entry (gated)
- `patient-assessments.controller.ts` (`@Controller({ path: 'me/assessments' })`,
  `@Roles(PATIENT)`): add
  ```ts
  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateAssessmentDto) {
    return this.patients.createMyAssessment(ctx, dto);
  }
  ```
  Reuse the existing `CreateAssessmentDto` (identical fields to the web form).
- `patients.service.ts` → `createMyAssessment(ctx, dto)`:
  ```ts
  const patientId = resolveScopePatientId(ctx);
  if (!ctx.user?.patientProfile?.canLogAssessments) {
    throw new ForbiddenException('Not allowed to log assessments');
  }
  return this.prisma.bodyAssessment.create({ data: { ...dto, patientId } });
  ```
- `listMyAssessments(ctx)`: add
  ```ts
  canLog: ctx.user?.patientProfile?.canLogAssessments ?? false,
  ```
  to the returned object.

The API enforces the gate independently of the UI (a patient whose flag is off
gets 403 even if they call the endpoint directly).

## 4. Web (`apps/web`)

- `components/patients/edit-patient-form.tsx`: add a **Switch** labelled
  "Permitir que o paciente registre bioimpedância no app", prefilled from
  `patient.canLogAssessments`, included in the PATCH payload.
- The patient update validation schema / form types gain the optional boolean.
- Uses the existing shadcn `Switch` (already used for meal-plan visibility /
  categories).

## 5. Mobile (`apps/mobile`)

### 5a. Gate on the Evolução screen (`app/(app)/index.tsx`)
- Read `canLog` from `useMyEvolution`.
- When `true`: render a "Registrar medição" button that navigates to the form
  route.
- When `false`: render **nothing** related to logging (100% hidden).

### 5b. New form screen (`app/(app)/nova-medicao.tsx`)
- A pushed route (not a tab). Mirrors the web form **exactly**:
  - `assessmentDate` — defaults to today, cannot be future.
  - The 15 numeric metrics: `weight, bodyFatPercentage, muscleMass, leanMass,
    visceralFat, basalMetabolicRate, bodyWaterPercentage, boneMass, metabolicAge,
    waistCircumference, hipCircumference, chestCircumference, armCircumference,
    thighCircumference`.
  - `notes` (≤ 2000 chars).
  - Validation identical to web: all metrics optional and **non-negative**;
    `weight` and `basalMetabolicRate` strictly **positive**; `metabolicAge`
    **integer**; **at least one metric** required; date not in the future.
  - pt-BR field labels matching the web form.
  - Built with the existing `Screen` (keyboard-aware) + `TextField` + `Button`
    primitives — no new UI primitives.
- `lib/queries/assessments.ts` (or a new `lib/queries/create-assessment.ts`):
  add `useCreateMyAssessment` → `apiFetch('/me/assessments', { method: 'POST',
  body })` → on success invalidate the evolution query and navigate back.
- **typedRoutes**: adding `nova-medicao` requires regenerating router types
  (`npx expo customize tsconfig.json`) before `tsc`. Do **not** name any test
  file with a `_layout` prefix.

## 6. Access & gating summary

| State | App | API |
| --- | --- | --- |
| `canLogAssessments = true` | "Registrar medição" button + form visible | `POST /me/assessments` creates |
| `canLogAssessments = false` | nothing rendered (hidden) | `POST /me/assessments` → 403 |

The flag defaults to `false`.

## 7. Testing

- **API (jest):**
  - `createMyAssessment` creates when the flag is on; throws `ForbiddenException`
    when off; scopes to the caller's own `patientId` (via `resolveScopePatientId`).
  - `listMyAssessments` includes `canLog` (true/false).
  - `UpdatePatientDto` accepts `canLogAssessments`; the whitelist still rejects
    unknown fields.
- **Web (vitest + RTL):** edit form renders the switch, prefills from the
  patient, and includes `canLogAssessments` in the submitted payload.
- **Mobile (jest):**
  - Evolução renders the "Registrar medição" affordance only when `canLog` is
    true; renders nothing when false.
  - Form validation mirrors web (at least one metric; non-future date;
    positive weight/BMR; integer metabolicAge).
  - Submitting posts to `/me/assessments` and invalidates the evolution query
    (mock `apiFetch`).
- **shared-types:** `pnpm --filter @nutri-plus/shared-types build` clean.

## 8. Global constraints

- SINGLE quotes in new files; pt-BR user-facing copy.
- The mobile form must mirror the web fields/validation exactly.
- Money N/A. Additive migration on the shared dev DB (`prisma migrate dev`);
  never commit `.env`.
- Reuse existing mobile primitives (`Screen`/`TextField`/`Button`); no new UI
  primitives. Expo Go must keep working (no dev-build-only native modules).
- typedRoutes regen (`expo customize`) before mobile `tsc` on the task adding
  the route; never name a test file `_layout*`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do not push/PR unless asked.
- Verify: API `pnpm --filter @nutri-plus/api test`; web `pnpm --filter
  @nutri-plus/web test`; shared-types build; mobile `tsc --noEmit` **and**
  `pnpm --filter @nutri-plus/mobile test`. Keep existing suites green.
