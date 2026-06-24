# Employee permissions in the UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reflect the existing backend EMPLOYEE permission model in the web UI — patients are read-only for employees (disabled edit form, no Save, no create), and the Funcionários module is nutritionist-only (hidden sidebar item, `/employees` denied).

**Architecture:** Role predicates in `lib/auth/access.ts` are consumed by (a) server-side route guards that render a shared `Unauthorized` component, (b) a sidebar nav filter, and (c) `canEdit`/`canCreate` props drilled from server pages into client components. A cached `getCurrentUser()` server helper gives the layout and the guarded pages one deduplicated role fetch per request. No React Context.

**Tech Stack:** Next.js 16 App Router (server + client components), React 19, react-hook-form, `@nutri-plus/shared-types` (`UserRole`, `MeResponse`), Vitest + Testing Library.

## Global Constraints

- **Branch:** `feat/employees-ui` (the design spec is committed there). Do all work on this branch. This ships in the same PR as the employees feature.
- **This is UI reflection, not new authorization.** The API already enforces the model via `@Roles` (patients: read routes allow EMPLOYEE, create/edit are NUTRITIONIST-only; employees module is NUTRITIONIST-only). Do not change any API code.
- **Quotes:** SINGLE quotes for NEW files. When EDITING, match the file's existing style. Verified: `app-sidebar.tsx` is **double**-quoted; `nav-items.ts`, `access.ts`, `access.test.ts`, `edit-patient-form.tsx`, `patient-detail.tsx`, `patients-list.tsx`, the `app/(app)` pages, and the `*.test.tsx` files are **single**-quoted.
- **pt-BR** for all user-facing copy.
- **Defaults preserve existing behavior:** `canEdit` (on `PatientDetail`/`EditPatientForm`) and `canCreate` (on `PatientsList`) default to `true`, so existing tests/usages that omit them are unaffected.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Permission predicates — `canManagePatients`, `canManageEmployees`

**Files:**
- Modify: `apps/web/src/lib/auth/access.ts`
- Test: `apps/web/src/lib/auth/access.test.ts` (extend — file exists)

**Interfaces:**
- Consumes: `UserRole` from `@nutri-plus/shared-types`.
- Produces: `canManagePatients(role: UserRole): boolean` and `canManageEmployees(role: UserRole): boolean` (both `true` only for `NUTRITIONIST`). Used by Tasks 4–7.

- [ ] **Step 1: Add the failing tests**

Append to `apps/web/src/lib/auth/access.test.ts`. First add the new names to the existing import on line 3:

```ts
import { canManageEmployees, canManagePatients, isWebDashboardRole } from './access';
```

Then add, after the existing `describe('isWebDashboardRole', …)` block:

```ts
describe('canManagePatients', () => {
  it('allows only nutritionists to create/edit patients', () => {
    expect(canManagePatients(UserRole.NUTRITIONIST)).toBe(true);
    expect(canManagePatients(UserRole.EMPLOYEE)).toBe(false);
    expect(canManagePatients(UserRole.PATIENT)).toBe(false);
  });
});

describe('canManageEmployees', () => {
  it('allows only nutritionists to manage employees', () => {
    expect(canManageEmployees(UserRole.NUTRITIONIST)).toBe(true);
    expect(canManageEmployees(UserRole.EMPLOYEE)).toBe(false);
    expect(canManageEmployees(UserRole.PATIENT)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- access.test`
Expected: FAIL — `canManagePatients` / `canManageEmployees` are not exported.

- [ ] **Step 3: Add the predicates**

In `apps/web/src/lib/auth/access.ts`, after the existing `isWebDashboardRole` function:

```ts
/** Only nutritionists can create or edit patients (employees are read-only). */
export function canManagePatients(role: UserRole): boolean {
  return role === UserRole.NUTRITIONIST;
}

/** Only nutritionists can view/manage the employees module. */
export function canManageEmployees(role: UserRole): boolean {
  return role === UserRole.NUTRITIONIST;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- access.test`
Expected: PASS — all access predicate tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auth/access.ts apps/web/src/lib/auth/access.test.ts
git commit -m "feat(web): add canManagePatients/canManageEmployees role predicates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `Unauthorized` screen component

**Files:**
- Create: `apps/web/src/components/auth/unauthorized.tsx`
- Test: `apps/web/src/components/auth/unauthorized.test.tsx`

**Interfaces:**
- Consumes: `next/link`.
- Produces: `Unauthorized()` — a server-renderable component showing a pt-BR "Não autorizado" message and a link to `/`. Used by the route guards (Task 5, and the patient pages context).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/auth/unauthorized.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Unauthorized } from './unauthorized';

describe('Unauthorized', () => {
  it('renders the not-authorized message and a link home', () => {
    render(<Unauthorized />);
    expect(screen.getByText(/não autorizado/i)).toBeInTheDocument();
    expect(screen.getByText(/não tem permissão/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voltar para o início/i })).toHaveAttribute('href', '/');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- unauthorized`
Expected: FAIL — cannot resolve `./unauthorized`.

- [ ] **Step 3: Create the component**

Create `apps/web/src/components/auth/unauthorized.tsx`:

```tsx
import Link from 'next/link';

export function Unauthorized() {
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center">
      <h1 className="font-heading text-xl font-bold">Não autorizado</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Você não tem permissão para acessar esta página.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
      >
        Voltar para o início
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- unauthorized`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/auth/unauthorized.tsx apps/web/src/components/auth/unauthorized.test.tsx
git commit -m "feat(web): add Unauthorized screen component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `getCurrentUser()` server helper + layout refactor

**Files:**
- Create: `apps/web/src/lib/auth/current-user.ts`
- Modify: `apps/web/src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `cache` from `react`; `createClient` from `@/lib/supabase/server`; `getMe`, `syncUser` from `@/lib/api/auth`; `ApiError` from `@/lib/api/client`; `UserRole`, `MeResponse` from `@nutri-plus/shared-types`.
- Produces: `getCurrentUser(): Promise<MeResponse | null>` — request-cached (React `cache()`), reads the Supabase session, returns the profile (provisioning once on a 409), or `null` when there is no session. Used by all guarded pages (Tasks 5–7).

**Note:** This is a refactor that centralizes the role-fetch logic currently inlined in the layout, so the layout and every guarded page share one deduplicated fetch per request. There is no straightforward unit test for a `cache()`-wrapped server helper that calls the Supabase server client; the verification gate is `tsc` + the build + the existing `(app)/page.test.tsx` staying green (the layout is not unit-tested today). The behavioral coverage comes from the page-guard tests in Tasks 5–7, which mock `getCurrentUser`.

- [ ] **Step 1: Create the helper**

Create `apps/web/src/lib/auth/current-user.ts`:

```ts
import { cache } from 'react';
import { UserRole, type MeResponse } from '@nutri-plus/shared-types';
import { createClient } from '@/lib/supabase/server';
import { getMe, syncUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

// The current dashboard user, or null when there is no session. Wrapped in
// React cache() so the (app) layout and any page calling it within the same
// request share a single network fetch. Provisions the local profile once on a
// 409 (confirmed session, no local user yet) — the same behavior the layout
// used to inline.
export const getCurrentUser = cache(async (): Promise<MeResponse | null> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;

  try {
    return await getMe(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      await syncUser(token, UserRole.NUTRITIONIST);
      return getMe(token);
    }
    throw err;
  }
});
```

- [ ] **Step 2: Refactor the layout to use it**

Replace the entire contents of `apps/web/src/app/(app)/layout.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { AppSidebar } from '@/components/app/app-sidebar';
import { MobileNavTrigger } from '@/components/app/mobile-nav-trigger';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { isWebDashboardRole } from '@/lib/auth/access';
import { getCurrentUser } from '@/lib/auth/current-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();

  if (me && !isWebDashboardRole(me.role)) {
    redirect('/download-app');
  }

  return (
    <SidebarProvider>
      <AppSidebar user={me ? { name: me.name, role: me.role } : null} />
      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
          <Logo variant="full" className="h-6" />
          <MobileNavTrigger />
        </header>
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

(Note: `me.role` is a `UserRole` from `MeResponse`. This is passed to `AppSidebar`, whose `user.role` prop is tightened to `UserRole` in Task 4.)

- [ ] **Step 3: Typecheck and confirm the existing layout-adjacent test still passes**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

Run: `pnpm --filter @nutri-plus/web test -- "app/(app)/page"`
Expected: PASS — the `(app) index` redirect test is unaffected.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/auth/current-user.ts "apps/web/src/app/(app)/layout.tsx"
git commit -m "refactor(web): extract cached getCurrentUser server helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Hide the "Funcionários" sidebar item for non-managers

**Files:**
- Modify: `apps/web/src/components/app/nav-items.ts`
- Modify: `apps/web/src/components/app/app-sidebar.tsx`
- Test: `apps/web/src/components/app/app-sidebar.test.tsx` (extend)

**Interfaces:**
- Consumes: `canManageEmployees` (Task 1); `UserRole` from `@nutri-plus/shared-types`.
- Produces: `NavItem` gains optional `canAccess?: (role: UserRole) => boolean`; `AppSidebar`'s `user` prop role is `UserRole`; the sidebar renders only nav items whose `canAccess` is absent or returns true for the current role.

**Quote note:** `nav-items.ts` is single-quoted; `app-sidebar.tsx` is double-quoted; `app-sidebar.test.tsx` is single-quoted. Match each file.

- [ ] **Step 1: Write the failing test**

In `apps/web/src/components/app/app-sidebar.test.tsx`:

(a) Add the `UserRole` import after line 4 (`import { SidebarProvider, useSidebar }…`):

```ts
import { UserRole } from '@nutri-plus/shared-types';
```

(b) Change the `renderSidebar` helper's type and default so role is a `UserRole`:

```ts
function renderSidebar(
  user: { name: string; role: UserRole } | null = { name: 'Dra. Ana', role: UserRole.NUTRITIONIST },
) {
  return render(
    <SidebarProvider>
      <AppSidebar user={user} />
    </SidebarProvider>,
  );
}
```

(c) In the mobile test, change the inline user (currently `{ name: 'Dra. Ana', role: 'NUTRITIONIST' }` on the `<AppSidebar user=…>` line) to `{ name: 'Dra. Ana', role: UserRole.NUTRITIONIST }`.

(d) Add two new tests inside `describe('AppSidebar', …)`:

```ts
it('hides the Funcionários item for an employee', () => {
  renderSidebar({ name: 'João', role: UserRole.EMPLOYEE });
  expect(screen.queryByRole('link', { name: /funcionários/i })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /pacientes/i })).toBeInTheDocument();
});

it('shows the Funcionários item for a nutritionist', () => {
  renderSidebar({ name: 'Dra. Ana', role: UserRole.NUTRITIONIST });
  expect(screen.getByRole('link', { name: /funcionários/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- app-sidebar`
Expected: FAIL — the employee still sees "Funcionários" (no filtering yet).

- [ ] **Step 3: Add `canAccess` to nav-items**

Replace the contents of `apps/web/src/components/app/nav-items.ts` with:

```ts
import { Users, Briefcase, Calendar, type LucideIcon } from 'lucide-react';
import { UserRole } from '@nutri-plus/shared-types';
import { canManageEmployees } from '@/lib/auth/access';

export type NavChild = {
  label: string;
  href: string;
};

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: NavChild[];
  canAccess?: (role: UserRole) => boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Pacientes', href: '/patients', icon: Users },
  { label: 'Funcionários', href: '/employees', icon: Briefcase, canAccess: canManageEmployees },
  {
    label: 'Agenda',
    href: '/agenda',
    icon: Calendar,
    children: [
      { label: 'Agenda', href: '/agenda' },
      { label: 'Categorias', href: '/agenda/categorias' },
    ],
  },
];
```

- [ ] **Step 4: Filter the nav in the sidebar (double quotes)**

In `apps/web/src/components/app/app-sidebar.tsx`:

(a) Add the `UserRole` import after the existing `nav-items` import (line 8):

```tsx
import { UserRole } from "@nutri-plus/shared-types";
```

(b) Tighten the `AppSidebarProps` type (currently `role: string`):

```tsx
type AppSidebarProps = {
  user: { name: string; role: UserRole } | null;
};
```

(c) Inside `AppSidebar`, just after `const { isMobile, setOpenMobile } = useSidebar();`, compute the visible items:

```tsx
  const role = user?.role;
  const items = NAV_ITEMS.filter(
    (item) => !item.canAccess || (role !== undefined && item.canAccess(role)),
  );
```

(d) Change the menu map from `NAV_ITEMS.map(` to `items.map(`.

(Leave `ROLE_LABELS` — a `Record<string, string>` — as is; a `UserRole` value indexes it fine.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- app-sidebar`
Expected: PASS — employee has no "Funcionários" link; nutritionist does; all prior sidebar cases stay green.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/app/nav-items.ts apps/web/src/components/app/app-sidebar.tsx apps/web/src/components/app/app-sidebar.test.tsx
git commit -m "feat(web): hide Funcionários nav item for non-nutritionists

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Server route guards for `/employees` and `/patients/new`

**Files:**
- Modify: `apps/web/src/app/(app)/employees/page.tsx`
- Modify: `apps/web/src/app/(app)/patients/new/page.tsx`
- Test: `apps/web/src/app/(app)/employees/page.test.tsx` (new)
- Test: `apps/web/src/app/(app)/patients/new/page.test.tsx` (new)

**Interfaces:**
- Consumes: `getCurrentUser` (Task 3); `canManageEmployees`, `canManagePatients` (Task 1); `Unauthorized` (Task 2); the existing `EmployeesView` and `CreatePatientForm`.
- Produces: both pages render `<Unauthorized />` when the current user is absent or lacks the capability, otherwise the real content.

**Test note:** these page components are `async` functions, so a test awaits the component and renders the returned element, mocking `@/lib/auth/current-user` and stubbing the heavy child (`EmployeesView` / `CreatePatientForm`) so the test exercises only the guard.

- [ ] **Step 1: Write the failing test for the employees guard**

Create `apps/web/src/app/(app)/employees/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@nutri-plus/shared-types';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/components/employees/employees-view', () => ({
  EmployeesView: () => <div>employees-view</div>,
}));

import EmployeesPage from './page';

function me(role: UserRole) {
  return { id: 'u1', email: 'x@y.com', name: 'X', role };
}

beforeEach(() => getCurrentUser.mockReset());

describe('EmployeesPage guard', () => {
  it('shows the employees view for a nutritionist', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.NUTRITIONIST));
    render(await EmployeesPage());
    expect(screen.getByText('employees-view')).toBeInTheDocument();
  });

  it('shows Não autorizado for an employee', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.EMPLOYEE));
    render(await EmployeesPage());
    expect(screen.getByText(/não autorizado/i)).toBeInTheDocument();
    expect(screen.queryByText('employees-view')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- "employees/page"`
Expected: FAIL — the page renders `EmployeesView` unconditionally (no guard yet), so the employee case fails.

- [ ] **Step 3: Add the employees guard**

Replace the contents of `apps/web/src/app/(app)/employees/page.tsx` with:

```tsx
import { EmployeesView } from '@/components/employees/employees-view';
import { Unauthorized } from '@/components/auth/unauthorized';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManageEmployees } from '@/lib/auth/access';

export default async function EmployeesPage() {
  const me = await getCurrentUser();
  if (!me || !canManageEmployees(me.role)) {
    return <Unauthorized />;
  }
  return <EmployeesView />;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- "employees/page"`
Expected: PASS — both cases green.

- [ ] **Step 5: Write the failing test for the new-patient guard**

Create `apps/web/src/app/(app)/patients/new/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@nutri-plus/shared-types';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/components/patients/create-patient-form', () => ({
  CreatePatientForm: () => <div>create-patient-form</div>,
}));

import NewPatientPage from './page';

function me(role: UserRole) {
  return { id: 'u1', email: 'x@y.com', name: 'X', role };
}

beforeEach(() => getCurrentUser.mockReset());

describe('NewPatientPage guard', () => {
  it('shows the create form for a nutritionist', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.NUTRITIONIST));
    render(await NewPatientPage());
    expect(screen.getByText('create-patient-form')).toBeInTheDocument();
  });

  it('shows Não autorizado for an employee', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.EMPLOYEE));
    render(await NewPatientPage());
    expect(screen.getByText(/não autorizado/i)).toBeInTheDocument();
    expect(screen.queryByText('create-patient-form')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- "patients/new/page"`
Expected: FAIL — the page renders `CreatePatientForm` unconditionally.

- [ ] **Step 7: Add the new-patient guard**

Replace the contents of `apps/web/src/app/(app)/patients/new/page.tsx` with:

```tsx
import { CreatePatientForm } from '@/components/patients/create-patient-form';
import { Unauthorized } from '@/components/auth/unauthorized';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function NewPatientPage() {
  const me = await getCurrentUser();
  if (!me || !canManagePatients(me.role)) {
    return <Unauthorized />;
  }
  return <CreatePatientForm />;
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- "patients/new/page"`
Expected: PASS — both cases green.

- [ ] **Step 9: Typecheck and commit**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

```bash
git add "apps/web/src/app/(app)/employees/page.tsx" "apps/web/src/app/(app)/employees/page.test.tsx" "apps/web/src/app/(app)/patients/new/page.tsx" "apps/web/src/app/(app)/patients/new/page.test.tsx"
git commit -m "feat(web): guard /employees and /patients/new by role

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Read-only patient editing for employees

**Files:**
- Modify: `apps/web/src/components/patients/edit-patient-form.tsx`
- Modify: `apps/web/src/components/patients/patient-detail.tsx`
- Modify: `apps/web/src/app/(app)/patients/[id]/page.tsx`
- Test: `apps/web/src/components/patients/edit-patient-form.test.tsx` (new)
- Test: `apps/web/src/components/patients/patient-detail.test.tsx` (extend)

**Interfaces:**
- Consumes: `getCurrentUser` (Task 3); `canManagePatients` (Task 1).
- Produces: `EditPatientForm({ patient, canEdit = true })` and `PatientDetail({ id, created, canEdit = true })`; the patient detail page passes `canEdit` based on the role. When `canEdit` is false, the form fields are disabled (native `<fieldset disabled>`) and the Save button is not rendered.

- [ ] **Step 1: Write the failing test for the form**

Create `apps/web/src/components/patients/edit-patient-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PatientDetail } from '@nutri-plus/shared-types';

const mutateAsync = vi.fn();
vi.mock('@/lib/queries/patients', () => ({
  useUpdatePatient: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EditPatientForm } from './edit-patient-form';

const patient = {
  id: 'p1',
  user: { id: 'u1', name: 'Maria Silva', email: 'maria@x.com' },
  birthDate: '1991-03-14T00:00:00.000Z',
  gender: 'FEMALE',
  height: 165,
  targetWeight: 62,
  objective: 'WEIGHT_LOSS',
  activityLevel: 'MODERATE',
  restrictions: null,
  allergies: null,
  medicalConditions: null,
  notes: null,
  nutritionistId: 'n1',
  createdAt: '2026-05-12T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  assessments: [],
} as unknown as PatientDetail;

beforeEach(() => mutateAsync.mockReset());

describe('EditPatientForm', () => {
  it('is editable by default: Save present and fields enabled', () => {
    render(<EditPatientForm patient={patient} />);
    expect(screen.getByRole('button', { name: /salvar alterações/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/altura/i)).not.toBeDisabled();
  });

  it('is read-only when canEdit is false: no Save and fields disabled', () => {
    render(<EditPatientForm patient={patient} canEdit={false} />);
    expect(screen.queryByRole('button', { name: /salvar alterações/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/altura/i)).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- edit-patient-form`
Expected: FAIL — `EditPatientForm` does not accept `canEdit`; the field stays enabled and Save always renders.

- [ ] **Step 3: Make the form respect `canEdit`**

In `apps/web/src/components/patients/edit-patient-form.tsx`, change the component signature and the JSX. The new signature:

```tsx
export function EditPatientForm({
  patient,
  canEdit = true,
}: {
  patient: PatientDetail;
  canEdit?: boolean;
}) {
```

Replace the returned JSX (the `<Form>…</Form>` block) with:

```tsx
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* A disabled fieldset natively disables every nested control (inputs,
            selects, textareas) — the read-only view for employees. */}
        <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <PatientClinicalFields control={form.control as any} />
        </fieldset>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" className="rounded-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- edit-patient-form`
Expected: PASS — both cases green (jest-dom's `toBeDisabled` treats a control inside a disabled `<fieldset>` as disabled).

- [ ] **Step 5: Thread `canEdit` through `PatientDetail` + extend its test**

In `apps/web/src/components/patients/patient-detail.tsx`, change the signature:

```tsx
export function PatientDetail({
  id,
  created,
  canEdit = true,
}: {
  id: string;
  created: boolean;
  canEdit?: boolean;
}) {
```

and pass it to the form (the existing `<EditPatientForm patient={patient} />` line):

```tsx
      <EditPatientForm patient={patient} canEdit={canEdit} />
```

Then add this case to `apps/web/src/components/patients/patient-detail.test.tsx`, inside `describe('PatientDetail', …)`:

```tsx
  it('hides Save when canEdit is false', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit={false} />);
    expect(screen.queryByRole('button', { name: /salvar alterações/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Pass `canEdit` from the detail page**

Replace the contents of `apps/web/src/app/(app)/patients/[id]/page.tsx` with:

```tsx
import { PatientDetail } from '@/components/patients/patient-detail';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const me = await getCurrentUser();
  const canEdit = !!me && canManagePatients(me.role);
  return <PatientDetail id={id} created={created === '1'} canEdit={canEdit} />;
}
```

- [ ] **Step 7: Run the patient tests + typecheck**

Run: `pnpm --filter @nutri-plus/web test -- patient-detail edit-patient-form`
Expected: PASS — including the existing "saves clinical edits via updatePatient" case (default `canEdit` is `true`).

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/patients/edit-patient-form.tsx apps/web/src/components/patients/edit-patient-form.test.tsx apps/web/src/components/patients/patient-detail.tsx apps/web/src/components/patients/patient-detail.test.tsx "apps/web/src/app/(app)/patients/[id]/page.tsx"
git commit -m "feat(web): make patient edit form read-only for employees

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Hide patient creation for employees

**Files:**
- Modify: `apps/web/src/components/patients/patients-list.tsx`
- Modify: `apps/web/src/app/(app)/patients/page.tsx`
- Test: `apps/web/src/components/patients/patients-list.test.tsx` (extend)

**Interfaces:**
- Consumes: `getCurrentUser` (Task 3); `canManagePatients` (Task 1).
- Produces: `PatientsList({ canCreate = true })`; the patients page passes `canCreate` based on the role. When `canCreate` is false, the header "+ Novo paciente" button and the empty-state "Cadastrar primeiro paciente" CTA are not rendered.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/components/patients/patients-list.test.tsx`, add two cases inside `describe('PatientsList', …)`:

```ts
  it('hides the create button when canCreate is false', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: false, data: [patient] });
    render(<PatientsList canCreate={false} />);
    expect(screen.queryByRole('link', { name: /novo paciente/i })).not.toBeInTheDocument();
  });
  it('hides the empty-state CTA when canCreate is false', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<PatientsList canCreate={false} />);
    expect(screen.getByText(/nenhum paciente/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /cadastrar primeiro paciente/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- patients-list`
Expected: FAIL — the create button/CTA render regardless of `canCreate`.

- [ ] **Step 3: Gate the create affordances**

In `apps/web/src/components/patients/patients-list.tsx`:

(a) Change the signature (currently `export function PatientsList() {`):

```tsx
export function PatientsList({ canCreate = true }: { canCreate?: boolean }) {
```

(b) Wrap the header button (the `<Button className="rounded-full" asChild>` with `<Link href="/patients/new">+ Novo paciente</Link>`) in a `canCreate` guard:

```tsx
        {canCreate && (
          <Button className="rounded-full" asChild>
            <Link href="/patients/new">+ Novo paciente</Link>
          </Button>
        )}
```

(c) Wrap the empty-state CTA (the `<Button className="rounded-full" asChild>` with `<Link href="/patients/new">Cadastrar primeiro paciente</Link>`) in the same guard:

```tsx
          {canCreate && (
            <Button className="rounded-full" asChild>
              <Link href="/patients/new">Cadastrar primeiro paciente</Link>
            </Button>
          )}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- patients-list`
Expected: PASS — new cases green; existing cases (which render `<PatientsList />` with the default `canCreate = true`) stay green.

- [ ] **Step 5: Pass `canCreate` from the patients page**

Replace the contents of `apps/web/src/app/(app)/patients/page.tsx` with:

```tsx
import { PatientsList } from '@/components/patients/patients-list';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function PatientsPage() {
  const me = await getCurrentUser();
  const canCreate = !!me && canManagePatients(me.role);
  return <PatientsList canCreate={canCreate} />;
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

```bash
git add apps/web/src/components/patients/patients-list.tsx apps/web/src/components/patients/patients-list.test.tsx "apps/web/src/app/(app)/patients/page.tsx"
git commit -m "feat(web): hide patient creation affordances for employees

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Full web suite: `pnpm --filter @nutri-plus/web test` — all green.
- [ ] Typecheck + build: `pnpm --filter @nutri-plus/web exec tsc --noEmit` and `pnpm build` — clean.
- [ ] Manual smoke (dev), as an **employee**: sidebar has no "Funcionários"; visiting `/employees` shows "Não autorizado"; patient list has no "+ Novo paciente"; `/patients/new` shows "Não autorizado"; opening a patient shows disabled fields and no Save. As a **nutritionist**: everything works exactly as before (Funcionários visible, create + edit functional).
