# Employees (Funcionários) page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a nutritionist list, search, invite, rename, and remove their employees over `/v1/employees` (plus a new `PATCH` for the name), and route invited employees to the web dashboard instead of the patient `/download-app` screen.

**Architecture:** A small new backend endpoint (`PATCH /v1/employees/:id` → updates the linked `User.name`, scoped to the nutritionist) plus a web feature built from the existing patients/categories patterns — shared-types, `browserApiFetch` API functions, React Query hooks, a zod-validated dialog, and a list view. The shared invite-acceptance flow gains role-based routing via `getMe`.

**Tech Stack:** NestJS + Prisma (apps/api, Jest); Next.js 16 App Router + React 19 + React Query + react-hook-form + zod + shadcn/radix dialog (apps/web, Vitest + RTL); `@nutri-plus/shared-types` (tsc-built package); Supabase auth (`@supabase/ssr`).

## Global Constraints

- **Branch:** `feat/employees-ui` (already created off `main`; the design spec is committed there). Do all work on this branch.
- **Quotes:** SINGLE quotes for all NEW files. When EDITING an existing file, match that file's existing quote style. Verified styles: `accept-invite.tsx` is **single**-quoted; `employees.controller.ts`, `employees.service.ts`, `employees.service.spec.ts`, `invite-employee.dto.ts` are **single**-quoted; `ui/input.tsx` is **double**-quoted (not edited here).
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **API scoping:** every employee query is scoped with `resolveScopeNutritionistId(ctx)`; a non-owned/missing id is a `404` (`NotFoundException`), indistinguishable from each other.
- **Hosted Supabase is the shared dev DB:** no schema migrations in this slice (the `EMPLOYEE` role and `EmployeeProfile` already exist in Prisma; `createInvitedEmployee` already writes `UserRole.EMPLOYEE`).
- **Error handling in production code uses `err instanceof ApiError`** (web) / typed Nest exceptions (api); tests adapt to that, never the reverse.
- **pt-BR** for all user-facing copy and validation messages.
- **Email is the login identity** — never editable. Edit changes the name only.

---

### Task 1: shared-types — `Employee` types + `EMPLOYEE` role

**Files:**
- Modify: `packages/shared-types/src/v1/user-role.ts`
- Create: `packages/shared-types/src/v1/employee.ts`
- Modify: `packages/shared-types/src/v1/index.ts`

**Interfaces:**
- Consumes: nothing (leaf types).
- Produces (later tasks import these from `@nutri-plus/shared-types`):
  - `enum UserRole { NUTRITIONIST, PATIENT, EMPLOYEE }`
  - `interface EmployeeUserSummary { id: string; name: string; email: string }`
  - `interface Employee { id: string; userId: string; nutritionistId: string; user: EmployeeUserSummary; createdAt: string; updatedAt: string }`
  - `interface InviteEmployeeRequest { name: string; email: string }`
  - `interface UpdateEmployeeRequest { name: string }`

**Note:** This is a types-only package with no runtime tests (`package.json` test script is a no-op). The verification gate is the package build (`tsc`) emitting the new declarations; downstream tasks then typecheck against them. The API does **not** need an enum change — its `UserRole` comes from the Prisma client (`../generated/prisma/client`), which already includes `EMPLOYEE`. This task fixes only the **web** shared-types enum so `MeResponse.role` and the accept-invite routing (Task 7) are type-correct.

- [ ] **Step 1: Add `EMPLOYEE` to the `UserRole` enum**

Replace the entire contents of `packages/shared-types/src/v1/user-role.ts` with:

```ts
export enum UserRole {
  NUTRITIONIST = 'NUTRITIONIST',
  PATIENT = 'PATIENT',
  EMPLOYEE = 'EMPLOYEE',
}
```

- [ ] **Step 2: Create the employee types**

Create `packages/shared-types/src/v1/employee.ts`:

```ts
// Dates are ISO strings over the wire.
export interface EmployeeUserSummary {
  id: string;
  name: string;
  email: string;
}

export interface Employee {
  id: string;
  userId: string;
  nutritionistId: string;
  user: EmployeeUserSummary;
  createdAt: string;
  updatedAt: string;
}

export interface InviteEmployeeRequest {
  name: string;
  email: string;
}

export interface UpdateEmployeeRequest {
  name: string;
}
```

- [ ] **Step 3: Export the new module from the barrel**

In `packages/shared-types/src/v1/index.ts`, add the employee export. The file becomes:

```ts
export * from './user-role';
export * from './auth';
export * from './patient';
export * from './appointment';
export * from './appointment-category';
export * from './employee';
```

- [ ] **Step 4: Build the package and verify the declarations**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: exits 0, no type errors.

Then run: `grep -E 'EMPLOYEE|InviteEmployeeRequest|UpdateEmployeeRequest|interface Employee' packages/shared-types/dist/index.d.ts`
Expected: lines showing `EMPLOYEE`, `Employee`, `InviteEmployeeRequest`, and `UpdateEmployeeRequest` are present in the emitted declarations.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/v1/user-role.ts packages/shared-types/src/v1/employee.ts packages/shared-types/src/v1/index.ts packages/shared-types/dist
git commit -m "feat(shared-types): add Employee types and EMPLOYEE role

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(If `packages/shared-types/dist` is git-ignored, `git add` it anyway — the command will no-op on ignored paths; the `src` files are what matter.)

---

### Task 2: API — `PATCH /v1/employees/:id` (update name)

**Files:**
- Create: `apps/api/src/employees/dto/update-employee.dto.ts`
- Modify: `apps/api/src/employees/employees.service.ts` (add `updateEmployee` method)
- Modify: `apps/api/src/employees/employees.controller.ts` (add `@Patch(':id')` route)
- Test: `apps/api/src/employees/employees.service.spec.ts` (add `updateEmployee` cases)

**Interfaces:**
- Consumes: `resolveScopeNutritionistId(ctx)`, `this.prisma.employeeProfile.findFirst`, `this.prisma.user.update`, the existing private `getEmployee(ctx, id)`, `NotFoundException`.
- Produces: `EmployeesService.updateEmployee(ctx: AuthContext, id: string, dto: UpdateEmployeeDto): Promise<Employee>` and the controller route `PATCH /v1/employees/:id`.

**Note on DTO validation:** `UpdateEmployeeDto` mirrors the existing `InviteEmployeeDto` style (`@IsString()` + `@MaxLength(200)`). The repo has no DTO-unit-test pattern (no `*.dto.spec.ts` files exist), and `InviteEmployeeDto` validation is exercised only by the global `ValidationPipe` at runtime — so this DTO follows the same convention and is not given a bespoke unit test. The service tests below cover the behavior.

- [ ] **Step 1: Write the failing service tests**

In `apps/api/src/employees/employees.service.spec.ts`, add these two tests inside the `describe('EmployeesService', …)` block (after the existing `removes an owned employee` / NotFound tests):

```ts
it('updates an owned employee name and returns the refreshed employee', async () => {
  prisma.employeeProfile.findFirst
    .mockResolvedValueOnce({ id: 'e1', userId: 'user-e' } as any) // scoped ownership lookup
    .mockResolvedValueOnce({
      id: 'e1',
      user: { id: 'user-e', name: 'New Name', email: 'e@x.com' },
    } as any); // getEmployee include
  prisma.user.update.mockResolvedValue({} as any);

  const result = await service.updateEmployee(ctx, 'e1', { name: 'New Name' });

  expect(prisma.employeeProfile.findFirst).toHaveBeenNthCalledWith(1, {
    where: { id: 'e1', nutritionistId: 'nutri-1' },
    select: { id: true, userId: true },
  });
  expect(prisma.user.update).toHaveBeenCalledWith({
    where: { id: 'user-e' },
    data: { name: 'New Name' },
  });
  expect(result).toEqual({
    id: 'e1',
    user: { id: 'user-e', name: 'New Name', email: 'e@x.com' },
  });
});

it('throws NotFoundException updating a non-owned employee', async () => {
  prisma.employeeProfile.findFirst.mockResolvedValue(null);

  await expect(
    service.updateEmployee(ctx, 'e1', { name: 'New Name' }),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(prisma.user.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/api test -- employees.service`
Expected: FAIL — `service.updateEmployee is not a function`.

- [ ] **Step 3: Create the DTO**

Create `apps/api/src/employees/dto/update-employee.dto.ts`:

```ts
import { IsString, MaxLength } from 'class-validator';

export class UpdateEmployeeDto {
  @IsString()
  @MaxLength(200)
  name!: string;
}
```

- [ ] **Step 4: Add the `updateEmployee` service method**

In `apps/api/src/employees/employees.service.ts`:

First, add the DTO import next to the existing `InviteEmployeeDto` import at the top:

```ts
import { InviteEmployeeDto } from './dto/invite-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
```

Then add this method inside the class, immediately after `removeEmployee` and before the private `getEmployee`:

```ts
  // Edit the only mutable field an employee has: the linked User's name. Scope
  // the lookup to the nutritionist (404 if not owned), then return the employee
  // through the shared include so the response shape matches list/invite.
  async updateEmployee(ctx: AuthContext, id: string, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.employeeProfile.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true, userId: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    await this.prisma.user.update({
      where: { id: employee.userId },
      data: { name: dto.name },
    });

    return this.getEmployee(ctx, employee.id);
  }
```

- [ ] **Step 5: Add the controller route**

In `apps/api/src/employees/employees.controller.ts`:

Add `Patch` to the `@nestjs/common` import list (alphabetically it sits before `Post`):

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
```

Add the DTO import next to the existing one:

```ts
import { InviteEmployeeDto } from './dto/invite-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
```

Add the route method inside the controller, between `list()` and `remove()`:

```ts
  @Patch(':id')
  update(
    @CurrentUser() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.updateEmployee(ctx, id, dto);
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/api test -- employees.service`
Expected: PASS — all `EmployeesService` tests green, including the two new ones.

- [ ] **Step 7: Typecheck/build the API**

Run: `pnpm --filter @nutri-plus/api build`
Expected: exits 0 (the new `Patch` route and DTO compile).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/employees
git commit -m "feat(api): add PATCH /v1/employees/:id to update employee name

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Web — employee validation schemas

**Files:**
- Create: `apps/web/src/lib/validation/employee.ts`
- Test: `apps/web/src/lib/validation/employee.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces: `inviteEmployeeSchema`, `updateEmployeeSchema`, and the inferred types `InviteEmployeeValues`, `UpdateEmployeeValues` (used by the dialog in Task 5).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/validation/employee.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { inviteEmployeeSchema, updateEmployeeSchema } from './employee';

describe('inviteEmployeeSchema', () => {
  it('accepts a valid name and email', () => {
    expect(
      inviteEmployeeSchema.safeParse({ name: 'Ana Paula', email: 'ana@x.com' }).success,
    ).toBe(true);
  });

  it('rejects a name shorter than 2 chars', () => {
    expect(inviteEmployeeSchema.safeParse({ name: 'A', email: 'ana@x.com' }).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(inviteEmployeeSchema.safeParse({ name: 'Ana Paula', email: 'nope' }).success).toBe(false);
  });
});

describe('updateEmployeeSchema', () => {
  it('accepts a valid name', () => {
    expect(updateEmployeeSchema.safeParse({ name: 'Ana Paula' }).success).toBe(true);
  });

  it('rejects a name shorter than 2 chars', () => {
    expect(updateEmployeeSchema.safeParse({ name: 'A' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- employee.test`
Expected: FAIL — cannot resolve `./employee` (module does not exist).

- [ ] **Step 3: Create the schemas**

Create `apps/web/src/lib/validation/employee.ts`:

```ts
import { z } from 'zod';

export const inviteEmployeeSchema = z.object({
  name: z.string().min(2, 'Informe o nome do funcionário.').max(200),
  email: z.string().email('Informe um e-mail válido.').max(320),
});

export const updateEmployeeSchema = z.object({
  name: z.string().min(2, 'Informe o nome do funcionário.').max(200),
});

export type InviteEmployeeValues = z.infer<typeof inviteEmployeeSchema>;
export type UpdateEmployeeValues = z.infer<typeof updateEmployeeSchema>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- employee.test`
Expected: PASS — all five cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/validation/employee.ts apps/web/src/lib/validation/employee.test.ts
git commit -m "feat(web): add employee invite/update validation schemas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Web — employees API functions + React Query hooks

**Files:**
- Create: `apps/web/src/lib/api/employees.ts`
- Create: `apps/web/src/lib/api/employees.test.ts`
- Create: `apps/web/src/lib/queries/employees.ts`

**Interfaces:**
- Consumes: `browserApiFetch` from `@/lib/api/browser`; `Employee`, `InviteEmployeeRequest`, `UpdateEmployeeRequest` from `@nutri-plus/shared-types` (Task 1).
- Produces:
  - `listEmployees(): Promise<Employee[]>`
  - `inviteEmployee(body: InviteEmployeeRequest): Promise<Employee>`
  - `updateEmployee(id: string, body: UpdateEmployeeRequest): Promise<Employee>`
  - `deleteEmployee(id: string): Promise<void>`
  - Hooks: `useEmployees()` (key `['employees']`), `useInviteEmployee()` (mutationFn `body`), `useUpdateEmployee()` (mutationFn `{ id, body }`), `useDeleteEmployee()` (mutationFn `id`). All mutations invalidate `['employees']`.

- [ ] **Step 1: Write the failing API-function tests**

Create `apps/web/src/lib/api/employees.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...args: unknown[]) => browserApiFetch(...args),
}));

import { listEmployees, inviteEmployee, updateEmployee, deleteEmployee } from './employees';

beforeEach(() => {
  browserApiFetch.mockReset().mockResolvedValue(undefined);
});

describe('employees API', () => {
  it('lists employees with a GET to /employees', async () => {
    await listEmployees();
    expect(browserApiFetch).toHaveBeenCalledWith('/employees');
  });

  it('invites with a POST and the body', async () => {
    await inviteEmployee({ name: 'Ana', email: 'ana@x.com' });
    expect(browserApiFetch).toHaveBeenCalledWith('/employees', {
      method: 'POST',
      body: { name: 'Ana', email: 'ana@x.com' },
    });
  });

  it('updates with a PATCH to the id path', async () => {
    await updateEmployee('e1', { name: 'Ana B' });
    expect(browserApiFetch).toHaveBeenCalledWith('/employees/e1', {
      method: 'PATCH',
      body: { name: 'Ana B' },
    });
  });

  it('deletes with a DELETE to the id path', async () => {
    await deleteEmployee('e1');
    expect(browserApiFetch).toHaveBeenCalledWith('/employees/e1', { method: 'DELETE' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- employees.test`
Expected: FAIL — cannot resolve `./employees`.

- [ ] **Step 3: Create the API functions**

Create `apps/web/src/lib/api/employees.ts`:

```ts
import type {
  Employee,
  InviteEmployeeRequest,
  UpdateEmployeeRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listEmployees(): Promise<Employee[]> {
  return browserApiFetch<Employee[]>('/employees');
}

export function inviteEmployee(body: InviteEmployeeRequest): Promise<Employee> {
  return browserApiFetch<Employee>('/employees', { method: 'POST', body });
}

export function updateEmployee(id: string, body: UpdateEmployeeRequest): Promise<Employee> {
  return browserApiFetch<Employee>(`/employees/${id}`, { method: 'PATCH', body });
}

export function deleteEmployee(id: string): Promise<void> {
  return browserApiFetch<void>(`/employees/${id}`, { method: 'DELETE' });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- employees.test`
Expected: PASS — all four cases green.

- [ ] **Step 5: Create the React Query hooks**

Create `apps/web/src/lib/queries/employees.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InviteEmployeeRequest, UpdateEmployeeRequest } from '@nutri-plus/shared-types';
import {
  deleteEmployee,
  inviteEmployee,
  listEmployees,
  updateEmployee,
} from '@/lib/api/employees';

export function useEmployees() {
  return useQuery({ queryKey: ['employees'], queryFn: listEmployees });
}

export function useInviteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteEmployeeRequest) => inviteEmployee(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateEmployeeRequest }) =>
      updateEmployee(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}
```

- [ ] **Step 6: Typecheck the whole web app**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0 (the new modules compile against the Task 1 shared-types).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api/employees.ts apps/web/src/lib/api/employees.test.ts apps/web/src/lib/queries/employees.ts
git commit -m "feat(web): add employees API client and React Query hooks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Web — `EmployeeDialog` (create / edit / delete)

**Files:**
- Create: `apps/web/src/components/employees/employee-dialog.tsx`
- Test: `apps/web/src/components/employees/employee-dialog.test.tsx`

**Interfaces:**
- Consumes: `inviteEmployeeSchema`, `updateEmployeeSchema` (Task 3); `useInviteEmployee`, `useUpdateEmployee`, `useDeleteEmployee` (Task 4); `Employee` (Task 1); `ApiError` from `@/lib/api/client`; the shadcn `Dialog*`, `Form*`, `Input`, `Button` primitives; `toast` from `sonner`.
- Produces: `EmployeeDialog({ open, onOpenChange, employee? })` — one component, create mode when `employee` is absent, edit mode when present. Edit mode shows the email read-only and offers an inline-confirm delete.

**Pattern source:** mirror `apps/web/src/components/agenda/category-dialog.tsx` (same dialog/form/toast structure) and its test `category-dialog.test.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/employees/employee-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const inviteMut = vi.fn();
const updateMut = vi.fn();
const deleteMut = vi.fn();

vi.mock('@/lib/queries/employees', () => ({
  useInviteEmployee: () => ({ mutateAsync: inviteMut, isPending: false }),
  useUpdateEmployee: () => ({ mutateAsync: updateMut, isPending: false }),
  useDeleteEmployee: () => ({ mutateAsync: deleteMut, isPending: false }),
}));

import { EmployeeDialog } from './employee-dialog';
import { ApiError } from '@/lib/api/client';

const onOpenChange = vi.fn();

const employee = {
  id: 'e1',
  userId: 'u1',
  nutritionistId: 'n1',
  user: { id: 'u1', name: 'Ana Paula', email: 'ana@x.com' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  inviteMut.mockReset().mockResolvedValue({});
  updateMut.mockReset().mockResolvedValue({});
  deleteMut.mockReset().mockResolvedValue(undefined);
  onOpenChange.mockReset();
});

describe('EmployeeDialog', () => {
  it('create: invites with the typed name and email', async () => {
    render(<EmployeeDialog open onOpenChange={onOpenChange} />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Ana Paula');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@x.com');
    await userEvent.click(screen.getByRole('button', { name: /enviar convite/i }));

    await waitFor(() => expect(inviteMut).toHaveBeenCalledTimes(1));
    expect(inviteMut.mock.calls[0][0]).toEqual({ name: 'Ana Paula', email: 'ana@x.com' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('edit: prefills the name, shows the email read-only, and updates the name', async () => {
    render(<EmployeeDialog open onOpenChange={onOpenChange} employee={employee} />);
    expect(screen.getByLabelText(/nome/i)).toHaveValue('Ana Paula');

    const email = screen.getByDisplayValue('ana@x.com');
    expect(email).toBeDisabled();

    const nameInput = screen.getByLabelText(/nome/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Ana B');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
    expect(updateMut.mock.calls[0][0]).toEqual({ id: 'e1', body: { name: 'Ana B' } });
  });

  it('edit: deleting requires inline confirmation, then removes', async () => {
    render(<EmployeeDialog open onOpenChange={onOpenChange} employee={employee} />);
    await userEvent.click(screen.getByRole('button', { name: /excluir/i }));
    expect(screen.getByText(/não pode ser desfeita/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^remover$/i }));
    await waitFor(() => expect(deleteMut).toHaveBeenCalledWith('e1'));
  });

  it('create: shows a friendly message on a 409 conflict and stays open', async () => {
    inviteMut.mockRejectedValue(new ApiError(409, null));
    render(<EmployeeDialog open onOpenChange={onOpenChange} />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Ana Paula');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@x.com');
    await userEvent.click(screen.getByRole('button', { name: /enviar convite/i }));

    expect(await screen.findByText(/já existe um usuário/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- employee-dialog`
Expected: FAIL — cannot resolve `./employee-dialog`.

- [ ] **Step 3: Create the dialog**

Create `apps/web/src/components/employees/employee-dialog.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { Employee } from '@nutri-plus/shared-types';
import { inviteEmployeeSchema, updateEmployeeSchema } from '@/lib/validation/employee';
import {
  useDeleteEmployee,
  useInviteEmployee,
  useUpdateEmployee,
} from '@/lib/queries/employees';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type EmployeeFormValues = { name: string; email: string };

function defaults(employee?: Employee): EmployeeFormValues {
  return {
    name: employee?.user.name ?? '',
    email: employee?.user.email ?? '',
  };
}

export function EmployeeDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee;
}) {
  const isEdit = Boolean(employee);
  const invite = useInviteEmployee();
  const update = useUpdateEmployee();
  const remove = useDeleteEmployee();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(
      isEdit ? updateEmployeeSchema : inviteEmployeeSchema,
    ) as Resolver<EmployeeFormValues>,
    defaultValues: defaults(employee),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaults(employee));
      setFormError(null);
      setConfirmingDelete(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee]);

  async function onSubmit(values: EmployeeFormValues) {
    setFormError(null);
    try {
      if (employee) {
        await update.mutateAsync({ id: employee.id, body: { name: values.name } });
        toast.success('Funcionário atualizado.');
      } else {
        await invite.mutateAsync({ name: values.name, email: values.email });
        toast.success('Convite enviado.');
      }
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 409
          ? 'Já existe um usuário com este e-mail.'
          : 'Não foi possível salvar. Tente novamente.';
      setFormError(message);
      toast.error(message);
    }
  }

  async function onDelete() {
    if (!employee) return;
    try {
      await remove.mutateAsync(employee.id);
      toast.success('Funcionário removido.');
      onOpenChange(false);
    } catch {
      toast.error('Não foi possível remover o funcionário.');
    }
  }

  const pending =
    form.formState.isSubmitting || invite.isPending || update.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar funcionário' : 'Novo funcionário'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEdit ? (
              // Plain Label (not FormLabel): this field is outside a FormField, and
              // FormLabel reads FormField context. The email is read-only display.
              <div className="space-y-1">
                <Label htmlFor="employee-email">E-mail</Label>
                <Input
                  id="employee-email"
                  type="email"
                  value={employee?.user.email ?? ''}
                  readOnly
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  O e-mail é a identidade de acesso e não pode ser alterado.
                </p>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="funcionario@email.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!isEdit && (
              <p className="text-xs text-muted-foreground">
                O funcionário receberá um convite por e-mail.
              </p>
            )}

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            {confirmingDelete ? (
              <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <p className="mr-auto text-sm text-muted-foreground">
                  Remover {employee?.user.name}? Esta ação não pode ser desfeita.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={remove.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={onDelete}
                  disabled={remove.isPending}
                >
                  {remove.isPending ? 'Removendo…' : 'Remover'}
                </Button>
              </DialogFooter>
            ) : (
              <DialogFooter className="justify-end">
                {isEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mr-auto rounded-full text-destructive"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={pending}
                  >
                    Excluir
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" className="rounded-full" disabled={pending}>
                  {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Enviar convite'}
                </Button>
              </DialogFooter>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- employee-dialog`
Expected: PASS — all four cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/employees/employee-dialog.tsx apps/web/src/components/employees/employee-dialog.test.tsx
git commit -m "feat(web): add EmployeeDialog for create/edit/delete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Web — `EmployeesView` (list + search + states) and page wiring

**Files:**
- Create: `apps/web/src/components/employees/employees-view.tsx`
- Test: `apps/web/src/components/employees/employees-view.test.tsx`
- Modify: `apps/web/src/app/(app)/employees/page.tsx`

**Interfaces:**
- Consumes: `useEmployees` (Task 4); `EmployeeDialog` (Task 5); `Employee` (Task 1); shadcn `Button`, `Input`, `Skeleton`.
- Produces: `EmployeesView()` rendered at `/employees`. Header with count + "+ Novo funcionário"; a "Buscar por nome" input that filters client-side; desktop table + mobile cards; loading / empty / no-match / error states; row click opens edit, header button opens create.

**Pattern source:** list states from `apps/web/src/components/patients/patients-list.tsx`; dialog wiring (`creating`/`editing` state) from `apps/web/src/components/agenda/categories-view.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/employees/employees-view.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useEmployees = vi.fn();
vi.mock('@/lib/queries/employees', () => ({
  useEmployees: () => useEmployees(),
  useInviteEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { EmployeesView } from './employees-view';

function employee(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    userId: 'u1',
    nutritionistId: 'n1',
    user: { id: 'u1', name: 'Ana Paula', email: 'ana@x.com' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  useEmployees.mockReset();
});

describe('EmployeesView', () => {
  it('shows a loading state', () => {
    useEmployees.mockReturnValue({ isLoading: true });
    render(<EmployeesView />);
    expect(screen.getByTestId('employees-loading')).toBeInTheDocument();
  });

  it('shows an empty state with an invite CTA', () => {
    useEmployees.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<EmployeesView />);
    expect(screen.getByText(/nenhum funcionário ainda/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /convidar funcionário/i })).toBeInTheDocument();
  });

  it('shows an error state', () => {
    useEmployees.mockReturnValue({ isLoading: false, isError: true });
    render(<EmployeesView />);
    expect(screen.getByText(/erro ao carregar/i)).toBeInTheDocument();
  });

  it('renders rows and filters by name', async () => {
    useEmployees.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        employee(),
        employee({ id: 'e2', user: { id: 'u2', name: 'Bruno Lima', email: 'bruno@x.com' } }),
      ],
    });
    render(<EmployeesView />);
    expect(screen.getAllByText('Ana Paula').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bruno Lima').length).toBeGreaterThan(0);

    await userEvent.type(screen.getByLabelText(/buscar por nome/i), 'bruno');
    expect(screen.queryByText('Ana Paula')).not.toBeInTheDocument();
    expect(screen.getAllByText('Bruno Lima').length).toBeGreaterThan(0);
  });

  it('shows a no-match message when the search finds nothing', async () => {
    useEmployees.mockReturnValue({ isLoading: false, isError: false, data: [employee()] });
    render(<EmployeesView />);
    await userEvent.type(screen.getByLabelText(/buscar por nome/i), 'zzz');
    expect(screen.getByText(/nenhum funcionário encontrado/i)).toBeInTheDocument();
  });

  it('opens the create dialog from the header button', async () => {
    useEmployees.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<EmployeesView />);
    await userEvent.click(screen.getByRole('button', { name: /novo funcionário/i }));
    expect(await screen.findByText(/o funcionário receberá um convite/i)).toBeInTheDocument();
  });

  it('opens the edit dialog when a row is clicked', async () => {
    useEmployees.mockReturnValue({ isLoading: false, isError: false, data: [employee()] });
    render(<EmployeesView />);
    await userEvent.click(screen.getAllByRole('button', { name: /ana paula/i })[0]);
    expect(await screen.findByText(/identidade de acesso/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- employees-view`
Expected: FAIL — cannot resolve `./employees-view`.

- [ ] **Step 3: Create the view**

Create `apps/web/src/components/employees/employees-view.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import type { Employee } from '@nutri-plus/shared-types';
import { useEmployees } from '@/lib/queries/employees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmployeeDialog } from '@/components/employees/employee-dialog';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase() || '?';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function EmployeesView() {
  const query = useEmployees();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);

  const employees = query.data ?? [];
  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (term ? employees.filter((e) => e.user.name.toLowerCase().includes(term)) : employees),
    [employees, term],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Funcionários</h1>
          {query.data && (
            <p className="mt-1 text-sm text-muted-foreground">
              {employees.length} {employees.length === 1 ? 'funcionário' : 'funcionários'}
            </p>
          )}
        </div>
        <Button className="rounded-full" onClick={() => setCreating(true)}>
          + Novo funcionário
        </Button>
      </div>

      {query.data && employees.length > 0 && (
        <Input
          placeholder="Buscar por nome"
          aria-label="Buscar por nome"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      )}

      {query.isLoading && (
        <div data-testid="employees-loading" className="space-y-2 rounded-xl border bg-card p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar os funcionários.{' '}
          <button
            onClick={() => query.refetch()}
            className="font-semibold text-primary hover:underline"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {query.data && employees.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="font-medium">Nenhum funcionário ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Convide o primeiro membro da sua equipe para começar.
          </p>
          <Button className="rounded-full" onClick={() => setCreating(true)}>
            Convidar funcionário
          </Button>
        </div>
      )}

      {query.data && employees.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum funcionário encontrado.
        </div>
      )}

      {filtered.length > 0 && (
        <>
          {/* Mobile: stacked cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setEditing(e)}
                className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                  {initials(e.user.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.user.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">{e.user.email}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Funcionário</th>
                  <th className="px-4 py-3 font-semibold">E-mail</th>
                  <th className="px-4 py-3 font-semibold">Desde</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setEditing(e)}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3 font-semibold">
                        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                          {initials(e.user.name)}
                        </span>
                        {e.user.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.user.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <EmployeeDialog open={creating} onOpenChange={(o) => !o && setCreating(false)} />
      {editing && (
        <EmployeeDialog open onOpenChange={(o) => !o && setEditing(null)} employee={editing} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- employees-view`
Expected: PASS — all seven cases green.

- [ ] **Step 5: Wire the page to the view**

Replace the entire contents of `apps/web/src/app/(app)/employees/page.tsx` with:

```tsx
import { EmployeesView } from '@/components/employees/employees-view';

export default function EmployeesPage() {
  return <EmployeesView />;
}
```

- [ ] **Step 6: Typecheck the web app**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/components/employees/employees-view.tsx" "apps/web/src/components/employees/employees-view.test.tsx" "apps/web/src/app/(app)/employees/page.tsx"
git commit -m "feat(web): employees list view with search and CRUD dialog wiring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Web — accept-invite routing by role

**Files:**
- Modify: `apps/web/src/components/auth/accept-invite.tsx` (the `onSubmit` handler + imports)
- Test: `apps/web/src/components/auth/accept-invite.test.tsx` (add `getMe` mock; update the existing patient case; add staff + fallback cases)

**Interfaces:**
- Consumes: `getMe` from `@/lib/api/auth` (returns `MeResponse` with a `role`); `UserRole` from `@nutri-plus/shared-types` (Task 1); the existing `supabase` client (`getSession`, `updateUser`, `signOut`), `router`.
- Produces: after the password is set — PATIENT → `signOut()` + `/download-app`; non-PATIENT (EMPLOYEE/NUTRITIONIST) → keep the session + `/` + `refresh()`; missing token or `getMe` failure → `signOut()` + `/login`.

**Note:** This file is single-quoted — match that. The existing test mocks Supabase auth and `next/navigation`; after this change the component also calls `getSession()` (to read the token) and `getMe(token)` on the success path, so the test's mocks must be extended (Step 1) before the component changes (Step 3), or the existing success test will break.

- [ ] **Step 1: Update the test file (failing) — add `getMe`, update patient case, add staff + fallback cases**

In `apps/web/src/components/auth/accept-invite.test.tsx`:

(a) Add a `getMe` mock alongside the existing Supabase mocks. After the `const push = vi.fn();` line, add:

```ts
const getMe = vi.fn();
```

and after the existing `vi.mock('next/navigation', …)` block, add:

```ts
vi.mock('@/lib/api/auth', () => ({
  getMe: (...args: unknown[]) => getMe(...args),
}));
```

(b) In `beforeEach`, add `getMe.mockReset();` (alongside the other `mockReset()` calls).

(c) Replace the existing test titled `establishes the session from the invite hash, then sets the password, signs out, and routes to /download-app` with this version (it now also stubs `getSession` to yield a token and `getMe` to return PATIENT):

```ts
  it('establishes the session from the invite hash, then sets the password, and routes a PATIENT to /download-app', async () => {
    setHash('#access_token=a.b.c&refresh_token=rt123&type=invite');
    setSession.mockResolvedValue({ data: { session: { user: { id: 'p1' } } }, error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    getMe.mockResolvedValue({ role: 'PATIENT' });
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    render(<AcceptInvite />);

    await userEvent.type(await screen.findByLabelText(/^senha$/i), 'supersecret');
    await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /concluir cadastro/i }));

    await waitFor(() =>
      expect(setSession).toHaveBeenCalledWith({ access_token: 'a.b.c', refresh_token: 'rt123' }),
    );
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'supersecret' }));
    await waitFor(() => expect(getMe).toHaveBeenCalledWith('tok'));
    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/download-app');
  });
```

(d) Add two new tests inside the `describe('AcceptInvite', …)` block:

```ts
  it('routes a non-patient (staff) to the dashboard and keeps the session', async () => {
    setHash('#access_token=a.b.c&refresh_token=rt123&type=invite');
    setSession.mockResolvedValue({ data: { session: { user: { id: 'e1' } } }, error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    getMe.mockResolvedValue({ role: 'EMPLOYEE' });
    updateUser.mockResolvedValue({ error: null });
    render(<AcceptInvite />);

    await userEvent.type(await screen.findByLabelText(/^senha$/i), 'supersecret');
    await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /concluir cadastro/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(signOut).not.toHaveBeenCalled();
  });

  it('falls back to /login when the role lookup fails', async () => {
    setHash('#access_token=a.b.c&refresh_token=rt123&type=invite');
    setSession.mockResolvedValue({ data: { session: { user: { id: 'x' } } }, error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    getMe.mockRejectedValue(new Error('boom'));
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    render(<AcceptInvite />);

    await userEvent.type(await screen.findByLabelText(/^senha$/i), 'supersecret');
    await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /concluir cadastro/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(signOut).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- accept-invite`
Expected: FAIL — the new staff/fallback cases fail (component still always routes to `/download-app`), and `getMe` is never called.

- [ ] **Step 3: Add the imports to the component**

In `apps/web/src/components/auth/accept-invite.tsx`, add these two imports after the existing `import { mapAuthError } from '@/lib/auth/errors';` line:

```ts
import { getMe } from '@/lib/api/auth';
import { UserRole } from '@nutri-plus/shared-types';
```

- [ ] **Step 4: Replace the `onSubmit` handler with role-based routing**

Replace the entire existing `onSubmit` function (currently lines 73–83 — from `async function onSubmit(values: ResetPasswordValues) {` through its closing `}`) with:

```ts
  async function onSubmit(values: ResetPasswordValues) {
    setFormError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }

    // The password is set. Route by role: patients use the mobile app only and
    // are signed out; staff (employees/nutritionists) keep the session and enter
    // the web dashboard. If the role can't be determined, fail safe to /login.
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        await supabase.auth.signOut();
        router.push('/login');
        return;
      }

      const me = await getMe(token);
      if (me.role === UserRole.PATIENT) {
        await supabase.auth.signOut();
        router.push('/download-app');
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      await supabase.auth.signOut();
      router.push('/login');
    }
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- accept-invite`
Expected: PASS — patient, staff, fallback, and the unchanged invalid/error cases all green.

- [ ] **Step 6: Typecheck the web app**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/auth/accept-invite.tsx apps/web/src/components/auth/accept-invite.test.tsx
git commit -m "feat(web): route invite acceptance by role (staff to dashboard, patient to app)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Run the full API test suite: `pnpm --filter @nutri-plus/api test` — all green.
- [ ] Run the full web test suite: `pnpm --filter @nutri-plus/web test` — all green (watch for any sibling suite that imports the changed modules).
- [ ] Build everything: `pnpm build` (turbo) — shared-types, api, and web all compile.
- [ ] Manual smoke (dev): on `/employees` — list renders, search filters, "Novo funcionário" invites, clicking a row edits the name and shows the read-only email, "Excluir" → inline confirm → removes. Accept an employee invite end-to-end and confirm landing on the dashboard (not `/download-app`); accept a patient invite and confirm `/download-app`.
