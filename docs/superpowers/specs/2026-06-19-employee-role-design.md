# Employee Role (Nutritionist Staff Accounts) — Design Spec

**Date:** 2026-06-19
**Status:** Approved for planning

## Context & purpose

Today the platform has two roles:

```prisma
enum UserRole {
  NUTRITIONIST
  PATIENT
}
```

Everything a nutritionist can do is scoped to *their own* `NutritionistProfile.id`:
both `PatientsService` and `MealPlansService` resolve the acting nutritionist's
profile id from `ctx.user.nutritionistProfile.id` and filter every query by it.

We want a third role, `EMPLOYEE`: an **extra account that belongs to a single
nutritionist** and can *read* that nutritionist's data (patients, assessments,
meal plans). It is the foundation for staff/assistant accounts; future surfaces
(agenda) and finer-grained permissions build on top of it.

## Decisions (approved in brainstorming)

1. **Permissions — read-only now.** An employee can *view* the owning
   nutritionist's patients, assessments, and meal plans, plus their own `/me`.
   No create/edit/delete, no AI generation. The model is designed so a
   **configurable per-employee permission system can be added later** without
   reshaping the data model — that is explicitly future work, not built now.
2. **Onboarding — invite-only.** The nutritionist invites an employee by email
   via the Supabase Admin API, exactly mirroring the patient invite flow. There
   is **no self-signup**: `sync-user` / `referralCode` are *not* extended for
   employees, so no one can self-attach as staff.
3. **Read scope (this iteration):** patients (list + detail), assessments,
   meal plans (view), and `/me`. Agenda is future/out of scope.
4. **Employee management ships now:** list (`GET /v1/employees`) and removal
   (`DELETE /v1/employees/:id`) are in scope, not deferred.
5. **Removal is a hard delete.** Unlike patients (who own immutable assessments
   and AI audit rows, hence `RESTRICT`), an employee owns no clinical/audit
   records. Removal deletes the local `EmployeeProfile` + `User`, then the
   Supabase identity. Nothing to orphan; no soft-delete needed.
6. **Single nutritionist per employee.** An employee belongs to exactly one
   nutritionist (`EmployeeProfile.nutritionistId`, non-nullable). Multi-clinic /
   membership-table designs are YAGNI for now.

## Data model (`schema.prisma`)

```prisma
enum UserRole {
  NUTRITIONIST
  PATIENT
  EMPLOYEE
}

model EmployeeProfile {
  id             String   @id @default(uuid())
  userId         String   @unique
  user           User     @relation(fields: [userId], references: [id])
  nutritionistId String
  nutritionist   NutritionistProfile @relation(fields: [nutritionistId], references: [id])
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([nutritionistId])
}
```

- `User` gains `employeeProfile EmployeeProfile?` (alongside the existing
  `nutritionistProfile` / `patientProfile`).
- `NutritionistProfile` gains `employees EmployeeProfile[]`.
- The `EmployeeProfile.nutritionist` FK uses Prisma's default `ON DELETE
  RESTRICT`, consistent with `PatientProfile.nutritionist` — a nutritionist
  with employees can't be deleted out from under them (nutritionist deletion is
  out of MVP scope anyway).

Mirrors the `PatientProfile` shape so the existing patterns (nested profile
create, `INCLUDE_PROFILES`, `LocalUser`) extend uniformly.

## Types & shared scope resolution

`LocalUser` (`auth/types/auth-context.ts`) gains
`employeeProfile: EmployeeProfile | null`, and `INCLUDE_PROFILES`
(`users.service.ts`) adds `employeeProfile: true`.

Today `PatientsService.nutritionistId(ctx)` and
`MealPlansService.nutritionistId(ctx)` are **duplicated** private methods, both
reading `ctx.user.nutritionistProfile.id`. This change consolidates them into a
single shared resolver and is the seam that makes the employee role a small
change:

`apps/api/src/auth/auth-scope.ts` →

```ts
// The NutritionistProfile.id whose data the caller is authorized to act within.
// NUTRITIONIST -> own profile id. EMPLOYEE -> the nutritionist they belong to.
export function resolveScopeNutritionistId(ctx: AuthContext): string {
  const user = ctx.user;
  if (user?.role === UserRole.NUTRITIONIST && user.nutritionistProfile) {
    return user.nutritionistProfile.id;
  }
  if (user?.role === UserRole.EMPLOYEE && user.employeeProfile) {
    return user.employeeProfile.nutritionistId;
  }
  throw new ForbiddenException('Nutritionist scope required');
}
```

`PatientsService` and `MealPlansService` drop their private `nutritionistId`
methods and call `resolveScopeNutritionistId(ctx)`. **No query changes** — every
existing `where: { nutritionistId: ... }` / `patient: { nutritionistId: ... }`
clause already filters by the resolved id, so an employee transparently sees
exactly their nutritionist's data and nothing else.

## Authorization (read-only enforcement)

Move `PatientsController` and `MealPlansController` from class-level
`@Roles(NUTRITIONIST)` to **method-level** roles:

- GET handlers → `@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)`
  - `GET /v1/patients`, `GET /v1/patients/:id`, `GET /v1/patients/:id/assessments`
  - `GET /v1/meal-plans`, `GET /v1/meal-plans/:id`
- All `@Post` / `@Patch` / `@Delete` handlers → `@Roles(UserRole.NUTRITIONIST)`
- AI meal generation (`meal-generation.controller.ts`) stays `NUTRITIONIST`-only.

`RolesGuard` already resolves method-level over class-level via
`reflector.getAllAndOverride([handler, class])`, so method decorators win.

**Defense in depth:** even if a write handler were mis-gated,
`resolveScopeNutritionistId` only returns a scope id for an employee on the read
path; write services that mutate via the resolver would still function for the
nutritionist, and employees are blocked at the guard. The guard is the primary
control; the resolver is a secondary boundary.

## Onboarding (Admin invite, mirrors patients)

New `EmployeesController` (`@Controller({ path: 'employees', version: '1' })`):

- **`POST /v1/employees`** — `@Roles(NUTRITIONIST)`. Body: `{ name, email }`
  (`InviteEmployeeDto`). Orchestrated by `EmployeesService.inviteEmployee(ctx, dto)`:
  1. Resolve the acting nutritionist id (`resolveScopeNutritionistId`, which for a
     nutritionist is their own profile id).
  2. `SupabaseAdminService.invitePatient`-equivalent invite (generalize the
     existing invite helper, or add `inviteUser(email, { name })`) → returns the
     Supabase `sub`.
  3. `UsersService.createInvitedEmployee({ authProviderId, email, name,
     nutritionistId })` creates `User` (role `EMPLOYEE`, `authProvider =
     SUPABASE`) with nested `employeeProfile.create`. P2002 → `409 Conflict`.
  4. On local-write failure, best-effort `deleteUser(sub)` rollback (same as
     `createPatient`).
- **`GET /v1/employees`** — `@Roles(NUTRITIONIST)`. Lists the acting
  nutritionist's employees (`where: { nutritionistId }`, with a user summary
  `{ id, name, email }`).
- **`DELETE /v1/employees/:id`** — `@Roles(NUTRITIONIST)`.
  `EmployeesService.removeEmployee(ctx, id)`:
  1. Ownership check: `findFirst({ where: { id, nutritionistId } })` → `404` if
     not found / not owned (existence does not leak, mirroring patients).
  2. Capture `userId` + `authProviderId` (the linked `User`).
  3. Transaction: delete `EmployeeProfile`, then `User`.
  4. Best-effort `SupabaseAdminService.deleteUser(authProviderId)` after the
     local delete commits. A Supabase failure leaves only an inert orphaned
     identity (no local user → cannot sync/act), which is acceptable.

`SyncUserDto`, `AuthService.syncUser`, and `UsersService.createWithProfile` are
**not** changed for employees (invite-only).

## `/me`

`GET /v1/auth/me` already returns `ctx.user` with profiles included. Once
`employeeProfile` is in `INCLUDE_PROFILES` and `LocalUser`, an employee's `/me`
carries `employeeProfile` (including `nutritionistId`). No logic change.

## Module wiring

New `EmployeesModule` (controller + service), importing `PrismaModule`,
`UsersModule`/`UsersService`, and `SupabaseModule` (the `SupabaseAdminService`),
registered in `AppModule` — mirroring how `PatientsModule` is assembled.

## Testing

- **`resolveScopeNutritionistId`** unit tests: nutritionist (own id), employee
  (owning nutritionist id), patient/unsynced/no-profile → `ForbiddenException`.
- **`RolesGuard`** already has coverage; add cases asserting employee passes
  read endpoints and is rejected on write endpoints.
- **Service tests:** an employee ctx sees only the owning nutritionist's
  patients/assessments/meal plans (scope correctness).
- **`EmployeesService`:** invite happy path; P2002 → 409; rollback on local
  failure; removal happy path (local txn + Supabase delete); removal of
  non-owned/missing employee → 404.
- **E2E:** employee can `GET` patients/assessments/meal-plans and `/me`; gets
  `403` on patient/meal-plan writes and AI generation; nutritionist invite →
  employee appears in `GET /v1/employees` → delete removes it. OpenAPI snapshot
  updated for the new `employees` paths.

## Out of scope (future)

- Configurable per-employee permissions (the data model leaves room; not built).
- Agenda and any non-patient employee surfaces.
- Employee self-signup / referral-code attach.
- Multiple nutritionists per employee; nutritionist (account) deletion.
