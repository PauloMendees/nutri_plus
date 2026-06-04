# Nutritionist-Created Patients (Invite-on-Create) — Design Spec

**Date:** 2026-06-04
**Status:** Approved for planning

## Context & purpose

Today a patient only becomes a record by self-onboarding: the patient must
already have a Supabase account and call `POST /v1/auth/sync-user` with a
nutritionist's `referralCode`. That is backwards for the real workflow — the
**nutritionist wants to register the patient during the consultation**, often
before the patient has any login.

This adds a nutritionist-driven creation flow: `POST /v1/patients` creates the
patient's clinical record **and** invites them to the platform in one step, using
the **Supabase Admin API** (`inviteUserByEmail`). The invite creates the Supabase
auth identity immediately and emails the patient a link to set their password, so
the local `User` + `PatientProfile` can be created right away (no nullable
`userId`, no model decoupling). When the patient later sets their password and
logs in, their account is already linked to the record the nutritionist built.

## Decisions (approved in brainstorming)

1. **Email is required** to create a patient (it's what enables the invite).
   Patients without an email (record-only, no account) are out of scope — that
   would need a decoupled `PatientProfile.userId`, deferred as a future option.
2. **Email already registered in Supabase → `409 Conflict`** ("a user with this
   email already exists"). Linking/merging an existing account is out of scope.
3. **Create payload:** `name` + `email` (required) + the optional clinical fields
   (reused from `UpdatePatientDto`).
4. **Authorization:** nutritionist-only (`@Roles(NUTRITIONIST)`); the new patient
   is auto-linked to the creating nutritionist (`nutritionistId`).
5. **`sync-user` stays.** It still onboards nutritionists and updates an invited
   patient on their first login (the local `User` already exists → update path).
   Patient self-create via `referralCode` remains functional but is no longer the
   primary path.
6. **Admin client:** add `@supabase/supabase-js` and wrap the Admin API in a small
   `SupabaseAdminService` (invite + best-effort delete for rollback).

## Architecture

`POST /v1/patients` is handled by `PatientsController` → `PatientsService.createPatient(ctx, dto)`, which orchestrates an external call then a local write:

1. Resolve the caller's nutritionist id (existing `nutritionistId(ctx)` helper).
2. **Invite:** `SupabaseAdminService.invitePatient(email, { name })` →
   `inviteUserByEmail`, returns the new Supabase user's `id` (the `sub`). Name is
   passed as `user_metadata.name` so the patient's future JWT carries it.
3. **Local write:** `UsersService.createInvitedPatient({ authProviderId: sub,
   email, name, nutritionistId, clinical })` creates the `User` (role `PATIENT`,
   `authProvider = SUPABASE`) with a nested `patientProfile.create` carrying
   `nutritionistId` + the clinical fields, in one Prisma call.
4. **Rollback safety:** if the local write fails *after* a successful invite,
   `PatientsService` calls `SupabaseAdminService.deleteUser(sub)` best-effort
   (logged, never masks the original error) so no orphaned Supabase user is left.
5. Return the created `PatientProfile` (including the `user` summary), `201`.

`SupabaseAdminService` builds a Supabase client once from `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` (via `ConfigService`) and exposes:
- `invitePatient(email, meta): Promise<{ id: string }>` — maps "user already
  exists" to a `ConflictException` (409) and transport failures to a
  `BadGatewayException` (502).
- `deleteUser(id): Promise<void>` — best-effort; swallows/logs errors.

A new `SupabaseAdminModule` provides/exports `SupabaseAdminService`; `PatientsModule` imports it.

## Components / files

- `apps/api/src/config/env.schema.ts` — add `SUPABASE_SERVICE_ROLE_KEY: z.string().min(1)`.
- `apps/api/.env.example` — add `SUPABASE_SERVICE_ROLE_KEY=CHANGE_ME` with a comment (server-side only, never expose).
- `apps/api/package.json` — add `@supabase/supabase-js`.
- `apps/api/src/supabase/supabase-admin.service.ts` (new) — the admin wrapper.
- `apps/api/src/supabase/supabase-admin.module.ts` (new) — provides/exports it.
- `apps/api/src/users/users.service.ts` — add `createInvitedPatient(input)` (creates `User` + `PatientProfile` for an externally-invited patient; maps the duplicate-email/identity `P2002` to `ConflictException`).
- `apps/api/src/patients/dto/create-patient.dto.ts` (new) — `CreatePatientDto extends UpdatePatientDto` (inherits the optional clinical fields) + required `name` (`@IsString`, `@MaxLength(200)`) and `email` (`@IsEmail`).
- `apps/api/src/patients/patients.service.ts` — add `createPatient(ctx, dto)` (orchestration + rollback). Inject `UsersService` + `SupabaseAdminService`.
- `apps/api/src/patients/patients.controller.ts` — add `@Post() create(...)` (201).
- `apps/api/src/patients/patients.module.ts` — import `SupabaseAdminModule` and `UsersModule`.
- `docs/03-patient-management.md` — note that nutritionist-driven creation via invite is now supported (updates the old "do not implement create patient" non-goal).

## Behavior & API

`POST /v1/patients` — nutritionist only.

Request (`CreatePatientDto`):
```json
{ "name": "Maria Silva", "email": "maria@example.com", "height": 165, "objective": "WEIGHT_LOSS" }
```
- `name`, `email` required; all clinical fields optional (same validators as `UpdatePatientDto`).

Responses:
- `201` — the created `PatientProfile` (+ `user: { id, name, email }`), linked to the caller.
- `400` — validation (missing/invalid email or name, bad clinical field).
- `403` — caller is not a nutritionist.
- `409` — a Supabase user with that email already exists.
- `502` — the Supabase Admin API is unreachable.

The patient receives a Supabase invite email; on setting their password and
logging in, `GET /v1/auth/me` / `sync-user` resolve the already-linked account.

## Error handling

Surfaces through the existing global `AllExceptionsFilter`. The invite happens
before the DB write; a post-invite DB failure triggers a best-effort
`deleteUser(sub)` (logged, original error re-thrown). The service role key and
invite responses are never logged.

## Dependencies / assumptions

- **`SUPABASE_SERVICE_ROLE_KEY`** must be set (server-side only). Boot fails fast
  via the Zod env validation if missing.
- **Supabase SMTP**: invite emails require email sending configured in the
  Supabase project (the built-in sender has low rate limits). This is a project
  configuration prerequisite, not code.
- `redirectTo` for the invite link (where the email sends the patient) is omitted
  for now (Supabase uses the project's Site URL); wiring a real frontend redirect
  is deferred until the web app exists.

## Testing

- **Unit (`patients.service.spec.ts`):** `createPatient` invites then creates the
  local patient with the returned `sub` + `nutritionistId`; on a DB-write failure
  it calls `deleteUser(sub)` and rethrows; a missing nutritionist profile →
  `ForbiddenException`. `SupabaseAdminService` + `UsersService` are mocked.
- **Unit (`users.service.spec.ts`):** `createInvitedPatient` issues the expected
  Prisma create (role `PATIENT`, `authProvider`, nested `patientProfile` with
  `nutritionistId` + clinical fields); duplicate identity `P2002` → `ConflictException`.
- **E2E (`patients.e2e-spec.ts`):** with `SupabaseAdminService` overridden by a
  fake (no real Supabase): `POST /v1/patients` → `201`, the patient is linked to
  the nutritionist and appears in `GET /v1/patients`; a `PATIENT` token → `403`;
  missing email → `400`; the fake signaling "email exists" → `409`.
- All existing suites (34 unit, 19 e2e) stay green.

## Out of scope

Patients without email / record-only profiles (decoupled `userId`); linking or
merging a pre-existing Supabase account; resending/expiring invites; invite
redirect URLs; bulk import; editing the patient's email after creation; SMS
invites. These are future iterations.
