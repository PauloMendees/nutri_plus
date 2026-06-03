# Patient Management (Step 03) — Design Spec

**Date:** 2026-06-02
**Status:** Approved for planning

## Context & purpose

Steps 01/02/02.1 gave us authenticated users synced into a local DB, with
nutritionists and patients linked via referral code. Step 03 builds the first
real domain feature on top of that: **nutritionists managing their patients**.

This spec implements `docs/03-patient-management.md` using the domain model
defined in `docs/3.1-patient-domain-mode.md`, which is the source of truth for
patient entities. Doc 03.1 **supersedes** the `ProgressEntry` model sketched in
doc 03: the time-series entity is now the richer `BodyAssessment`, and the
endpoints are `/assessments` (not `/progress`).

## Scope

- **In:** nutritionist-facing patient management — list patients, view a
  patient's details, update a patient's clinical fields, create and list body
  assessments. Plus the schema work (clinical fields on `PatientProfile`,
  `BodyAssessment` table, three enums).
- **Out (YAGNI):**
  - Patient self-access endpoints (a patient reading their own profile /
    assessments) — deferred to step 07 (`patient-app-api`). The global
    `RolesGuard` already blocks patients from these nutritionist-only routes, so
    "patients cannot access nutritionist-only endpoints" is satisfied implicitly.
  - Creating patients via the API — patients self-onboard via the existing
    `POST /v1/auth/sync-user` + referral code flow. There is no `POST /patients`.
  - Updating or deleting assessments — assessments are immutable historical
    records (doc 03.1 Rule 2). To "correct" one, create a new assessment.
  - File uploads, image analysis, messaging, notifications (doc 03 Non-Goals).
  - Structured restriction/allergy/condition tables — these stay free-text
    `String?` for the MVP (doc 03.1 Future Extensions).

## Architecture (Approach A)

A single `PatientsModule` (controller + service) owns patients **and** their
assessments as a sub-resource. Rationale: assessments are always addressed under
a patient (`/patients/:id/assessments`) and inherit the parent's ownership, so a
separate module would add wiring for no gain. We can extract an assessments
module later if it earns its own logic.

**Ownership is enforced at query time, not via a guard.** Every nutritionist
query is filtered by `nutritionistId = ctx.user.nutritionistProfile.id`. This
makes ownership part of the query itself (impossible to forget, no
check-then-act race). A patient that exists but isn't linked to the caller is
indistinguishable from one that doesn't exist → `404` (avoids leaking
existence). Assessment routes resolve the parent patient under the same filter
first, so they inherit ownership.

The controller is annotated `@Roles(UserRole.NUTRITIONIST)` and versioned `v1`.

## Data model

A single additive Prisma migration (`add_patient_clinical_model`). All changes
are additions; existing `PatientProfile` rows get `NULL`s — no data loss.

### Enums

```prisma
enum Gender {
  MALE
  FEMALE
  OTHER
  PREFER_NOT_TO_SAY
}

enum PatientObjective {
  WEIGHT_LOSS
  MUSCLE_GAIN
  MAINTENANCE
  RECOMPOSITION
}

enum ActivityLevel {
  SEDENTARY
  LIGHT
  MODERATE
  ACTIVE
  VERY_ACTIVE
}
```

### PatientProfile (added fields — all nullable)

`birthDate DateTime?`, `gender Gender?`, `height Float?` (cm),
`targetWeight Float?` (kg), `objective PatientObjective?`,
`activityLevel ActivityLevel?`, `restrictions String?`, `allergies String?`,
`medicalConditions String?`, `notes String?` (private nutritionist notes; not
exposed to AI by default), and the relation `assessments BodyAssessment[]`.

Existing fields (`id`, `userId`, `nutritionistId`, timestamps, `@@index`) are
unchanged.

### BodyAssessment (new)

```prisma
model BodyAssessment {
  id                  String   @id @default(uuid())
  patientId           String
  patient             PatientProfile @relation(fields: [patientId], references: [id])
  assessmentDate      DateTime @default(now())

  weight              Float?
  bodyFatPercentage   Float?
  muscleMass          Float?
  leanMass            Float?
  visceralFat         Float?
  basalMetabolicRate  Float?
  bodyWaterPercentage Float?
  boneMass            Float?
  metabolicAge        Int?

  waistCircumference  Float?
  hipCircumference    Float?
  chestCircumference  Float?
  armCircumference    Float?
  thighCircumference  Float?

  notes               String?
  createdAt           DateTime @default(now())

  @@index([patientId, assessmentDate])
}
```

The compound index serves both "list newest first" and "latest snapshot"
queries efficiently.

## Endpoints

All under `@Controller({ path: 'patients', version: '1' })`, all
`@Roles(UserRole.NUTRITIONIST)`. `:id` is the **`PatientProfile.id`**.

| Method | Route | Action |
|---|---|---|
| GET | `/v1/patients` | List patients linked to the authenticated nutritionist |
| GET | `/v1/patients/:id` | Patient detail + the latest assessment |
| PATCH | `/v1/patients/:id` | Update clinical fields |
| POST | `/v1/patients/:id/assessments` | Create an assessment (immutable) |
| GET | `/v1/patients/:id/assessments` | List assessments, newest first |

### Responses

- **List patients:** array of patient profiles including the linked `user`'s
  `id`, `name`, `email` (so the nutritionist sees who each patient is).
- **Patient detail:** full `PatientProfile` (clinical fields) + the linked
  `user` basics + the single latest `BodyAssessment` (or `null`).
- **Update patient:** the updated `PatientProfile`.
- **Create assessment:** the created `BodyAssessment` (`201`).
- **List assessments:** array of `BodyAssessment`, ordered by `assessmentDate`
  desc.

## DTOs & validation (class-validator, via the global ValidationPipe)

**`UpdatePatientDto`** — every field optional (partial update):
- `birthDate`: `@IsDateString()` and must not be in the future.
- `gender` / `objective` / `activityLevel`: `@IsEnum(...)`.
- `height` / `targetWeight`: `@IsPositive()`.
- `restrictions` / `allergies` / `medicalConditions` / `notes`: `@IsString()`
  `@MaxLength(2000)`.
- `userId`, `nutritionistId`, timestamps are **not** accepted — only the
  clinical fields above are writable (whitelist via the DTO + `whitelist: true`).

**`CreateAssessmentDto`** — all fields optional:
- `assessmentDate`: `@IsDateString()`, defaults to now when omitted; must not be
  in the future.
- All `Float?` body metrics: `@IsNumber()` + `@Min(0)` (zero is physically
  meaningful for some indices; negatives are not). `metabolicAge`: `@IsInt()`
  `@Min(0)`.
- `notes`: `@IsString()` `@MaxLength(2000)`.

## Error handling

Reuses the global `AllExceptionsFilter` and `ValidationPipe`. Surfaces the
standard `{ statusCode, message, error }` shape.

- `404 Not Found` — patient id not found **or** not linked to the caller (same
  response for both, to avoid leaking existence).
- `400 Bad Request` — DTO validation failure.
- `403 Forbidden` — a non-`NUTRITIONIST` token (handled by `RolesGuard`).
- **Edge case:** a `NUTRITIONIST`-role token whose synced user has no
  `nutritionistProfile` (should not happen given sync-user creates it, but is
  guarded) → `403 Forbidden` rather than a crash. The service reads
  `ctx.user.nutritionistProfile.id`; if absent, throw `ForbiddenException`.

## Components / files

- `apps/api/prisma/schema.prisma` — add the three enums, the `PatientProfile`
  fields, and the `BodyAssessment` model + index.
- New migration `add_patient_clinical_model`.
- `apps/api/src/patients/patients.module.ts` (new).
- `apps/api/src/patients/patients.controller.ts` (new).
- `apps/api/src/patients/patients.service.ts` (new).
- `apps/api/src/patients/dto/update-patient.dto.ts` (new).
- `apps/api/src/patients/dto/create-assessment.dto.ts` (new).
- `apps/api/src/app.module.ts` — register `PatientsModule`.
- `docs/03-patient-management.md` — mark the `ProgressEntry` / `progress`
  section as superseded by doc 03.1 (`BodyAssessment` + `/assessments`).
- `docs/architecture.md` — add Patient Management to the feature overview if
  appropriate.

The `@CurrentUser()` decorator and `AuthContext` already supply
`ctx.user.nutritionistProfile.id`; no auth changes are required.

## Testing

- **Unit (`patients.service.spec.ts`):**
  - List/detail/update queries always include the `nutritionistId` ownership
    filter.
  - A patient that exists but belongs to another nutritionist → `NotFoundException`.
  - Detail selects the single latest assessment.
  - Update maps only the whitelisted clinical fields.
  - Missing `nutritionistProfile` on the context → `ForbiddenException`.
- **E2E (`patients.e2e-spec.ts`, reusing the JWKS test harness):**
  - A nutritionist lists only their own patients.
  - Reading/patching another nutritionist's patient → `404`.
  - Create then list assessments returns them newest-first.
  - A `PATIENT` token on any `/v1/patients` route → `403`.
  - Invalid DTO body → `400`.
- All existing suites (24 unit + 8 e2e) must remain green.

The dev/runtime database is the hosted **Supabase** Postgres (`.env`
`DATABASE_URL`); `prisma migrate dev` applies the new migration there. The e2e
suite is isolated on its own database (`TEST_DATABASE_URL`, default local
`nutri_plus_test`) and never touches Supabase — so it requires a local Postgres
to be running.

## Out of scope

Patient self-service endpoints (step 07), creating/deleting patients via API,
mutating assessments, structured restriction/allergy tables, file uploads, image
analysis, messaging, notifications, analytics/reporting.
