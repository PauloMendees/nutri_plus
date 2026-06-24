# Employees (Funcionários) page — Design

**Date:** 2026-06-24
**Status:** Approved (pending implementation plan)
**Scope:** The Funcionários module UI: **list**, **search by name**, **create** (invite by e-mail), **edit** (name), and **delete** an employee, over the existing `/v1/employees` API plus one new endpoint (`PATCH` for name). Also routes the shared invite-acceptance flow by role so an invited employee lands on the dashboard (not the patient "baixe o app" screen).
**Builds on:** the patients-UI patterns (React Query + `browserApiFetch` + `@nutri-plus/shared-types`, react-hook-form + zod, the shadcn `dialog`) and the existing employees API. New branch `feat/employees-ui` off `main`.

---

## 1. Goal

A nutritionist can see their team, find a member by name, invite a new one, rename one, and remove one. Invited employees, after setting their password, land in the web dashboard.

Done when: `/employees` lists the nutritionist's employees with a name search; "Novo funcionário" invites by e-mail; clicking a row edits the name (email read-only); an employee can be removed (hard delete) with a confirmation; and an employee who accepts their invite is taken to the dashboard rather than `/download-app`.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Create | **Invite by e-mail** (`POST /v1/employees`, name + email) — same pattern as creating a patient. |
| Edit | **Name only**, via a **new `PATCH /v1/employees/:id`** (email is the login identity, not editable). |
| Search | **Client-side filter by name** (case-insensitive) on the fetched list (no server search param). |
| Delete | The existing **hard delete** (`DELETE`), behind an inline confirm. |
| Create/edit UI | A single **`EmployeeDialog`** (dialog, not a dedicated page — employees are just name + email). |
| Invite acceptance | Route `/accept-invite` **by role**: PATIENT → `/download-app`; EMPLOYEE/NUTRITIONIST → dashboard. |
| `UserRole` (web) | Add **`EMPLOYEE`** to the shared-types enum (employees are now first-class in the web). |

## 3. API contract (`/v1/employees`, role NUTRITIONIST)

Existing:
- `POST /v1/employees` — `InviteEmployeeDto { name (≤200), email }`. Invites via Supabase Admin + creates the local `EMPLOYEE` user + profile. Returns the `Employee`.
- `GET /v1/employees` — returns `Employee[]` (each `EmployeeProfile` + `user { id, name, email }`) scoped to the nutritionist.
- `DELETE /v1/employees/:id` — `204`; hard delete (profile + user + Supabase identity in a transaction); `404` if not owned.

New (this slice):
- **`PATCH /v1/employees/:id`** — `UpdateEmployeeDto { name (req, ≤200) }`; `updateEmployee(ctx, id, dto)`: `findFirst` the profile scoped to `resolveScopeNutritionistId(ctx)` → `404` if absent; update the linked `User.name`; return the employee via the existing `getEmployee` include. Roles: NUTRITIONIST.

## 4. shared-types (`packages/shared-types/src/v1`)

- New `employee.ts`: `EmployeeUserSummary { id, name, email }`; `Employee { id, userId, nutritionistId, user: EmployeeUserSummary, createdAt, updatedAt }` (dates ISO strings); `InviteEmployeeRequest { name, email }`; `UpdateEmployeeRequest { name }`. Export from `index.ts`.
- `user-role.ts`: add `EMPLOYEE = 'EMPLOYEE'` to the `UserRole` enum (so `MeResponse.role` and the accept-invite routing are type-correct for employees).

## 5. Web data layer

- `lib/api/employees.ts` — `listEmployees(): Promise<Employee[]>`, `inviteEmployee(body): Promise<Employee>` (POST), `updateEmployee(id, body): Promise<Employee>` (PATCH), `deleteEmployee(id): Promise<void>` (DELETE) — via `browserApiFetch`.
- `lib/queries/employees.ts` — `useEmployees()` (key `['employees']`), `useInviteEmployee()`, `useUpdateEmployee()` (mutationFn `{ id, body }`), `useDeleteEmployee()` (mutationFn `id`). Mutations invalidate `['employees']`.
- `lib/validation/employee.ts` — `inviteEmployeeSchema` (`name` min 2 / max 200; `email` valid / max 320), `updateEmployeeSchema` (`name` only). pt-BR messages.

## 6. EmployeesView — `/employees` (replaces the stub)

`EmployeesView` (client):
- Header: title "Funcionários" + count + a **"Novo funcionário"** button (opens the create dialog).
- A **search `Input`** ("Buscar por nome") that filters the loaded list client-side (case-insensitive substring on `user.name`).
- List: desktop `<table>` (`hidden md:block`) + mobile stacked cards (`md:hidden`) — mirroring the patients list. Columns/fields: **Funcionário** (avatar initials + name), **E-mail**, **Desde** (`createdAt`, `dd/MM/yyyy`). Clicking a row opens the **edit** dialog.
- States: **loading** (skeleton rows), **empty** ("Nenhum funcionário ainda" + create CTA; when the search yields nothing: "Nenhum funcionário encontrado"), **error** (message + retry via `refetch`).

## 7. EmployeeDialog — create / edit / delete

A shadcn `dialog` + react-hook-form + zod. One component, two modes:
- **Create** ("Novo funcionário"): Nome (`Input`) + E-mail (`Input type=email`) → `inviteEmployee`. A note: "O funcionário receberá um convite por e-mail." On success: toast + close + invalidate.
- **Edit** (`employee` prop): title "Editar funcionário"; Nome editable; **E-mail shown read-only** (disabled input or static text — it's the login identity). Submit → `updateEmployee(id, { name })`. Footer also has an **"Excluir"** button that switches the footer to an **inline confirm** ("Remover {nome}? Esta ação não pode ser desfeita." → Cancelar / Remover) → `deleteEmployee(id)` → toast + close + invalidate.
- Errors via `err instanceof ApiError`: `409` on invite → "Já existe um usuário com este e-mail."; other → generic pt-BR. Submit/delete disabled while pending.

## 8. Invite-acceptance routing by role (`apps/web/src/components/auth/accept-invite.tsx`)

After `updateUser({ password })` succeeds, determine the role before deciding where to go:
- Read the session token (the page already has a session from the invite hash) and call `getMe(token)` (`@/lib/api/auth`).
- **PATIENT** → `signOut()` → `router.push('/download-app')` (today's behavior).
- **EMPLOYEE / NUTRITIONIST** (or any non-PATIENT) → keep the session, `router.push('/')` + `router.refresh()` (the `(app)` layout admits non-patients).
- If `getMe` fails → fall back to `signOut()` → `/login` (safe default). The "convite inválido" / set-password UI is unchanged.

## 9. Error handling

- Forms: inline zod messages (pt-BR). API errors via `ApiError` (`instanceof`) → friendly pt-BR (invite 409 → "já existe"; generic fallback). Delete is destructive → inline confirm before calling the API. Mutations disable their button while pending and invalidate `['employees']`.
- List: loading skeleton; empty (no employees vs no search match); error + retry.

## 10. Testing

- **API (Jest):** `updateEmployee` — updates `User.name`, scoped to the nutritionist, `404` for a non-owned/missing id; `UpdateEmployeeDto` validation. (Existing invite/list/delete tests stay.)
- **Web (Vitest + RTL):** employees API funcs (paths/methods/bodies/token); `inviteEmployeeSchema`/`updateEmployeeSchema`; `EmployeesView` (renders rows, search filters by name, empty + no-match states, row→edit, "Novo funcionário"→create dialog); `EmployeeDialog` (create calls `inviteEmployee`; edit prefilled + email read-only + `updateEmployee` with the name; delete confirm → `deleteEmployee`; 409 → friendly message); `accept-invite` role routing (PATIENT → `/download-app`; EMPLOYEE → `/`).

## 11. Out of scope (YAGNI / next slices)

Editing an employee's e-mail (it's the login identity); employee roles/permissions/titles (the profile has none); resending invites; server-side search/pagination; employee detail page (a dialog covers name+email); the patient-facing app.
