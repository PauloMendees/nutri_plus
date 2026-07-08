# Employee permissions in the UI — Design

**Date:** 2026-06-24
**Status:** Approved (pending implementation plan)
**Scope:** Reflect the existing backend permission model for the `EMPLOYEE` role in the web UI so employees never see affordances that would 403. Two capabilities are involved: **patients are read-only for employees** (view yes; create/edit no), and **the Funcionários module is nutritionist-only** (hidden from the sidebar; forced URL shows a "Não autorizado" screen).
**Builds on:** the employees feature (branch `feat/employees-ui`, not yet pushed) — this is the natural completion of the employee-permissions story and ships in the **same branch / same PR**. Reuses the existing pattern where `(app)/layout.tsx` fetches the role server-side and passes it as a prop.

---

## 1. Goal

A logged-in employee sees a coherent, permission-aware UI: they can view patients but cannot create or edit them, and they cannot reach the Funcionários page (no menu item; a forced URL is denied). A nutritionist sees no change. Done when: for an employee, the patient edit form has its fields disabled and no Save button; "+ Novo paciente" and `/patients/new` are unavailable (button hidden, route shows "Não autorizado"); the "Funcionários" sidebar item is absent and `/employees` shows "Não autorizado". For a nutritionist, everything works exactly as before.

## 2. Context: the permission model already exists in the API

This is **UI reflection, not new authorization** — the API already enforces it via `@Roles`:

- `PatientsController` defaults to `@Roles(NUTRITIONIST)`; only the read routes are widened: `GET /patients`, `GET /patients/:id`, `GET /patients/:id/assessments` are `@Roles(NUTRITIONIST, EMPLOYEE)`. So `POST /patients` (create), `PATCH /patients/:id` (edit), and `POST /patients/:id/assessments` are nutritionist-only.
- `EmployeesController` is `@Roles(NUTRITIONIST)` for every route — employees have no access at all.
- Employees see their nutritionist's data scope via `resolveScopeNutritionistId` (EMPLOYEE → `employeeProfile.nutritionistId`).

The UI changes below mirror exactly this model. Real enforcement stays in the API; the UI work removes broken affordances (a Save button that 403s, a page that 403s).

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Patient scope for employees | **Full read-only.** View list + detail; the edit form is disabled with no Save; create is unavailable (button hidden + `/patients/new` denied). Matches the API (create AND edit are nutritionist-only). |
| Funcionários for employees | **Hidden + denied.** Sidebar item removed; `/employees` shows "Não autorizado". |
| Where permission logic lives | Role predicates in `lib/auth/access.ts`; consumed by server route-guards, the sidebar filter, and `canEdit`/`canCreate` props. **No React Context** (YAGNI — prop drilling matches the existing layout→sidebar pattern). |
| Route protection | **Server-side** for the two hard-blocked routes (`/employees`, `/patients/new`) → render a shared `Unauthorized` server component (no flash, not just hiding). |
| Field read-only mechanism | A native **`<fieldset disabled>`** around the edit form body — disables all nested controls at once without threading a flag into each field. |
| Branch | Same branch `feat/employees-ui`; same PR. |

## 4. Permission predicates — `lib/auth/access.ts`

Existing: `isWebDashboardRole(role)` (`role !== PATIENT`). Add two capability predicates (named by capability, not role, so future configurable permissions are a one-line change):

```ts
export function canManagePatients(role: UserRole): boolean {
  return role === UserRole.NUTRITIONIST; // create + edit
}
export function canManageEmployees(role: UserRole): boolean {
  return role === UserRole.NUTRITIONIST;
}
```

## 5. Current user (server) — `lib/auth/current-user.ts` (new)

A single cached helper so the layout and the guarded pages share one role fetch per request:

```ts
export const getCurrentUser = cache(async (): Promise<MeResponse | null> => { … });
```

It encapsulates what `(app)/layout.tsx` does today: read the Supabase session; if a token exists, `getMe(token)`; on `ApiError 409` provision once via `syncUser(token, NUTRITIONIST)` then refetch; otherwise return `null`. Wrapped in React `cache()` so `layout.tsx` + any page calling it within the same request dedupe to one network call. `(app)/layout.tsx` is refactored to use it (its inline `loadProfile` moves here); the layout's existing `isWebDashboardRole` redirect to `/download-app` is unchanged.

## 6. "Não autorizado" screen — `components/auth/unauthorized.tsx` (new)

A small server-renderable component: heading **"Não autorizado"**, a pt-BR message ("Você não tem permissão para acessar esta página."), and a link back to `/`. Styled like the existing empty/error cards (`rounded-xl border bg-card p-8 text-center`).

## 7. Sidebar — hide "Funcionários"

`nav-items.ts`: `NavItem` gains an optional `canAccess?: (role: UserRole) => boolean`; the Funcionários item sets `canAccess: canManageEmployees`. `AppSidebar` already receives the role — it filters `NAV_ITEMS` to those whose `canAccess` is absent or returns true for the current role. The sidebar's `user.role` prop is typed `UserRole` (tightened from `string`) so the predicate is type-correct; `ROLE_LABELS` lookup is unaffected.

## 8. Route guards (server pages)

- **`/employees/page.tsx`**: `const me = await getCurrentUser();` → if `!me || !canManageEmployees(me.role)` render `<Unauthorized />`, else `<EmployeesView />`.
- **`/patients/new/page.tsx`**: same shape with `canManagePatients(me.role)` → `<Unauthorized />` or `<CreatePatientForm />`.

(The `(app)` layout already blocks patients entirely, so these guards only ever separate employee vs nutritionist.)

## 9. Read-only patient editing

- **`/patients/[id]/page.tsx`** (server): `const me = await getCurrentUser();` → pass `canEdit={!!me && canManagePatients(me.role)}` to `<PatientDetail id created canEdit />`.
- **`PatientDetail`**: accepts `canEdit: boolean` (default `true`, to keep the existing `patient-detail.test.tsx` — which renders it without the prop — valid), forwards it to `<EditPatientForm patient canEdit />`.
- **`EditPatientForm`**: accepts `canEdit: boolean` (default `true`). The clinical fields are wrapped in `<fieldset disabled={!canEdit} className="space-y-4 border-0 p-0">` so every control is natively disabled when read-only. The Save button renders only when `canEdit` (`{canEdit && <Button type="submit">…</Button>}`). When `canEdit` is false there is no submit affordance and `onSubmit`/`toast` paths are unreachable.

## 10. Patient list — hide create

- **`/patients/page.tsx`** (server): `const me = await getCurrentUser();` → `<PatientsList canCreate={!!me && canManagePatients(me.role)} />`.
- **`PatientsList`**: accepts `canCreate: boolean` (default `true` to keep existing tests/usages valid). When false, the header "+ Novo paciente" button and the empty-state "Cadastrar primeiro paciente" CTA are not rendered (the empty-state text remains).

## 11. Error handling / behavior

- No new API calls or error states beyond `getCurrentUser` (which reuses the layout's existing `getMe`/409-provision logic). A `null` user (no session) is treated as "not allowed" by the guards — but the layout already gates the `(app)` group, so in practice `me` is non-null for rendered pages.
- The UI changes are presentational; the API remains the source of truth. If an employee somehow issues a blocked mutation, the API still returns 403 (unchanged).

## 12. Testing (Vitest + Testing Library)

- **`access.test.ts`**: `canManagePatients` and `canManageEmployees` → `true` for `NUTRITIONIST`, `false` for `EMPLOYEE` and `PATIENT`.
- **`unauthorized.test.tsx`**: renders the "Não autorizado" heading/message and a link to `/`.
- **`app-sidebar` (extend existing test)**: role `EMPLOYEE` → no "Funcionários" item; role `NUTRITIONIST` → "Funcionários" present. (Existing sidebar tests stay green.)
- **`edit-patient-form.test.tsx` (new or extended)**: `canEdit={false}` → no Save button and a representative field is `disabled`; `canEdit={true}` (or default) → Save present and fields enabled.
- **`patients-list.test.tsx` (extend)**: `canCreate={false}` → "+ Novo paciente" absent (and empty-state CTA absent); default/`true` → present. Existing cases pass `canCreate` (or rely on the default).
- Server route-guards (`employees/page`, `patients/new/page`) are thin (predicate → `Unauthorized` vs content); covered indirectly by the predicate tests. A focused render test may mock `getCurrentUser` to assert `Unauthorized` shows for an employee, where it compiles cleanly under the jsdom/server-component constraints; otherwise it is left to the predicate + component tests.

## 13. Out of scope (YAGNI)

Backend authorization changes (already enforced); a configurable per-user permission system (the predicates are the single seam for that later); disabling/hiding the agenda for employees (employees keep agenda access — not part of this request); employee self-service of their own profile; per-field patient permissions; the bioimpedância section (a "Em breve" placeholder with no edit affordance).
