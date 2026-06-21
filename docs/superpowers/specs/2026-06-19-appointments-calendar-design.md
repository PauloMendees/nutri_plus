# Appointments Calendar — Design Spec

**Date:** 2026-06-19
**Status:** Approved for planning

## Context & purpose

Nutritionists (and their employees) need to schedule patient appointments on a
calendar. An appointment has a start and end time, a required title, an optional
description, and an optional link to a patient. Two appointments on the same
nutritionist's calendar must never overlap in time.

This builds directly on the `EMPLOYEE` role work (merged in PR #10): the shared
`resolveScopeNutritionistId(ctx)` resolver already maps both a `NUTRITIONIST` and
an `EMPLOYEE` to the owning nutritionist's profile id. Appointments are scoped the
same way, so a nutritionist and their employees share one calendar.

## Decisions (approved in brainstorming)

1. **One shared calendar per nutritionist.** Overlap is checked against all of a
   nutritionist's appointments, regardless of who created them. An employee
   schedules into the owning nutritionist's calendar.
2. **Employees get write access to appointments.** Employees are read-only
   everywhere else, but every appointment route is open to both
   `NUTRITIONIST` and `EMPLOYEE`. This is a deliberate, domain-scoped expansion.
3. **Patient link is optional.** An appointment may stand alone or link to one of
   the nutritionist's own patients (ownership validated).
4. **Half-open intervals `[start, end)`.** Appointments that merely touch at a
   boundary do NOT conflict.
   - Block: 1:00–2:00 vs 1:30–2:30 → conflict (overlap).
   - Green: 1:00–2:00 vs 2:00–2:30 → allowed (touching boundary).
5. **Overlap enforced by an application check-then-insert** (not a DB constraint).
   The service queries for an overlap and rejects with `409 Conflict`. This leaves
   a small TOCTOU race window under truly concurrent requests; accepted for now.
   A Postgres `EXCLUDE` constraint (btree_gist + `tstzrange`) is the documented
   future-hardening path (see Out of scope).
6. **Operations:** create, list (date-range), get one, update/reschedule, and
   **hard delete** (no soft-cancel/status field).
7. **No `createdBy` attribution** on appointments for now (YAGNI). Easy to add
   later if per-staff attribution on the shared calendar is wanted.

## Data model (`schema.prisma`)

```prisma
model Appointment {
  id             String   @id @default(uuid())
  nutritionistId String
  nutritionist   NutritionistProfile @relation(fields: [nutritionistId], references: [id])
  patientId      String?
  patient        PatientProfile? @relation(fields: [patientId], references: [id], onDelete: Restrict)
  title          String
  description    String?
  startsAt       DateTime
  endsAt         DateTime
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([nutritionistId, startsAt])
}
```

- `NutritionistProfile` gains `appointments Appointment[]`; `PatientProfile` gains
  `appointments Appointment[]`.
- Times are stored as UTC `DateTime` (`TIMESTAMP(3)`), consistent with the rest of
  the schema.
- The optional `patient` FK uses `onDelete: Restrict` (explicit), matching the
  codebase's conservative stance on patient-linked rows; patient deletion is out
  of MVP scope regardless.
- `@@index([nutritionistId, startsAt])` serves both the date-range list query and
  the overlap lookup with a single ordered index scan.

## Scoping & authorization

New `AppointmentsController` (`@Controller({ path: 'appointments', version: '1' })`)
with **class-level `@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)`** — every
route (create, list, get, update, delete) is open to both roles.

Every operation resolves the calendar owner via `resolveScopeNutritionistId(ctx)`
and scopes all queries by that `nutritionistId`. A non-owned or missing
appointment returns `404` (existence does not leak), mirroring `PatientsService`.

## Overlap rule

Half-open `[start, end)`. Two appointments A and B on the same nutritionist's
calendar conflict iff:

```
A.startsAt < B.endsAt  AND  A.endsAt > B.startsAt
```

- **Create:** before inserting, query the nutritionist's appointments for any row
  satisfying `startsAt < :newEnd AND endsAt > :newStart`. If one exists → throw
  `ConflictException` (`409`). Otherwise insert.
- **Update:** same check, additionally excluding the appointment being updated
  (`id != :currentId`). Only re-run when `startsAt`/`endsAt` change (always safe to
  run regardless).

This is check-then-insert (per decision 5); the race window is documented and
accepted.

## Endpoints

All under `/v1`, all `@Roles(NUTRITIONIST, EMPLOYEE)`.

- **`POST /v1/appointments`** — `CreateAppointmentDto`: `title` (required),
  `description?`, `startsAt`, `endsAt`, `patientId?`. Returns the created
  appointment (201). `409` on overlap; `400` on bad body / `endsAt <= startsAt` /
  invalid `patientId`.
- **`GET /v1/appointments?from=&to=`** — optional ISO datetime window. When both
  provided, returns the nutritionist's appointments overlapping `[from, to)`
  (`startsAt < to AND endsAt > from`); when omitted, returns all the
  nutritionist's appointments. Ordered by `startsAt` ascending. Includes the
  linked patient summary (`{ id, name, email }` via `user`) when present.
- **`GET /v1/appointments/:id`** — single appointment detail (scoped). `404` if
  not owned/missing.
- **`PATCH /v1/appointments/:id`** — `UpdateAppointmentDto` (all optional):
  `title`, `description`, `patientId` (set or clear), `startsAt`, `endsAt`.
  Ownership-checked; re-runs the overlap check; validates `patientId` ownership and
  `endsAt > startsAt` against the merged result. `409`/`400`/`404` as above.
- **`DELETE /v1/appointments/:id`** — ownership-checked hard delete →
  `204 No Content`.

## Validation & errors

- `title`: required string, `@MaxLength(200)`.
- `description`: optional string, `@MaxLength(2000)`.
- `startsAt` / `endsAt`: ISO-8601 datetime (`@IsDateString`/transformed to `Date`).
  `endsAt` must be strictly after `startsAt` → `400 BadRequest` otherwise.
- `patientId`: optional UUID; if provided, must belong to the resolved
  nutritionist (reuse the existing ownership check) → else `400 BadRequest`
  ("Invalid patient").
- Overlap → `409 Conflict` ("Appointment overlaps an existing one").
- Not-owned/missing appointment → `404 NotFound` ("Appointment not found").

## Module wiring

`AppointmentsModule` (controller + service). `PrismaService` comes from the global
`PrismaModule`. Registered in `AppModule` next to `PatientsModule`. No Supabase or
Users dependency (no invite flow).

## Testing

- **Unit (`AppointmentsService`):**
  - Overlap predicate: the exact block case (1:00–2:00 vs 1:30–2:30 → conflict) and
    green case (1:00–2:00 vs 2:00–2:30 → allowed), plus full-containment and
    identical-times conflicts.
  - `endsAt <= startsAt` → `BadRequestException`.
  - Update excludes the appointment itself from the overlap check.
  - `patientId` not owned → `BadRequestException`; owned → accepted.
  - Scoping: a `NUTRITIONIST` ctx and an `EMPLOYEE` ctx both resolve to the owning
    nutritionist id in the query `where`.
  - Not-owned/missing appointment on get/update/delete → `NotFoundException`.
- **E2E (`appointments.e2e-spec.ts`):**
  - Nutritionist and employee can both create / list / get / update / delete.
  - Block case → `409`; green case → `201` (the literal times from the brief).
  - Create without a patient, and with an owned patient (and `400` for a patient
    owned by a different nutritionist).
  - Employee-created appointment conflicts with the nutritionist's existing one
    (shared calendar).
  - Cross-nutritionist isolation: nutB cannot get/update/delete nutA's appointment
    (`404`) and does not see it in their list.
  - List date-range filter returns only appointments overlapping the window,
    ordered by `startsAt`.
  - `DELETE` returns `204` and the appointment disappears from the list.
  - A `PATIENT` token gets `403` on appointment routes.
  - OpenAPI document includes `/v1/appointments` and `/v1/appointments/{id}`.

## Out of scope (future)

- DB-level overlap guarantee via a Postgres `EXCLUDE` constraint
  (`btree_gist` + `tstzrange(startsAt, endsAt, '[)')`) — the race-proof hardening
  of decision 5.
- Soft cancellation / appointment status, recurring appointments, reminders.
- `createdBy` per-staff attribution.
- Per-employee permission configuration (employees currently get full appointment
  write access by role).
- Working-hours / availability rules beyond raw overlap.
