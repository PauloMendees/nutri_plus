# Patient meal plans (visibility + viewer + PDF) & "Fora de casa" AI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The nutritionist marks which meal plans a patient can see; the patient app lists visible plans (auto-open 1 / pick if >1), views them, downloads the PDF, and can ask an "outside home" AI assistant what to eat.

**Architecture:** Part A adds a `visibleToPatient` flag (prisma + shared-types), a dedicated `PATCH /meal-plans/:id/visibility` write, a read filter on the patient endpoints, and a web toggle. Part B adds a patient-scoped PDF endpoint (branding resolved from the patient's own nutritionist) and the mobile viewer/picker + download-and-share. Part C adds an `OutsideHomeRequest` model + `POST /me/outside-home` reusing the existing `OpenAIProvider`, and a 4th mobile tab.

**Tech Stack:** NestJS + Prisma, `@nutri-plus/shared-types` (tsc-built), Next.js web (vitest+RTL), Expo SDK 54 + Expo Router (typedRoutes ON) + React Query + expo-file-system/expo-sharing, OpenAI via `OpenAIProvider`.

## Global Constraints

- Branch `feat/patient-meal-plans-outside-home` (off `main`; spec committed `0f7c8c9`). Commit only; do not push/PR unless asked.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **SINGLE quotes** in new files; **pt-BR** user-facing copy; mobile uses **relative imports** + reuses `Screen`/`TextField`/`Button` (no new mobile UI primitives).
- **Expo Go must keep working** — only Expo-SDK modules (`expo-file-system`, `expo-sharing`, `@expo/vector-icons`); no dev-build-only native modules. Do NOT reintroduce `node-linker=hoisted`. Never commit `.env` or `.expo/`.
- Visibility default is **hidden** (`@default(false)`); migrations are **additive** on the shared dev DB. The Supabase anon key stays client-only. **AI suggestions must contain no medical claims** (prompt-enforced).
- **typedRoutes is ON.** Any task adding an `(app)` route must regenerate `.expo/types/router.d.ts` before `tsc` with `pnpm --filter @nutri-plus/mobile exec npx expo customize tsconfig.json` (non-destructive; `expo export` does NOT regenerate types here). **Never name a mobile test file with a `_layout` prefix** (the typed-routes generator misparses it).
- **Mobile query/mutation hook tests:** do NOT use `renderHook` (returns undefined in RNTL 14.0.1). Render a small Probe component inside a `QueryClientProvider` whose client is `new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })` (gcTime:0 avoids a hanging jest). Single mobile test with parens in the path: escape them, e.g. `jest "app/\(app\)/planos/index.test.tsx"`.
- Verify: API `pnpm --filter @nutri-plus/api test`; shared-types `pnpm --filter @nutri-plus/shared-types build`; web `pnpm --filter @nutri-plus/web test`; mobile `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` AND `pnpm --filter @nutri-plus/mobile test`. Keep suites green (API 190, web 273, mobile 45).

---

## PART A — Meal-plan visibility (web + api)

### Task 1: Visibility flag — data contract + API

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add field) + new migration dir
- Modify: `packages/shared-types/src/v1/meal-plan.ts`
- Modify: `apps/api/src/meal-plans/meal-plans.service.ts` (`listMyPlans`, `getMyPlan`, add `setVisibility`)
- Create: `apps/api/src/meal-plans/dto/set-visibility.dto.ts`
- Modify: `apps/api/src/meal-plans/meal-plans.controller.ts` (add `PATCH :id/visibility`)
- Test: `apps/api/src/meal-plans/meal-plans.service.spec.ts`

**Interfaces:**
- Produces: `MealPlan.visibleToPatient: boolean`; `SetMealPlanVisibilityRequest { visibleToPatient: boolean }`; `MealPlansService.setVisibility(ctx, id, visibleToPatient): Promise<MealPlan>`; `PATCH /v1/meal-plans/:id/visibility`.
- Consumes: existing `requireOwnedPlan(ctx, id)`, `patientProfileId(ctx)`.

- [ ] **Step 1: Prisma field + migration**

In `apps/api/prisma/schema.prisma`, add to `model MealPlan` (after `aiGenerated`):

```prisma
  visibleToPatient Boolean @default(false) // nutritionist opt-in; patient app only shows visible plans
```

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name add_meal_plan_visibility`
Expected: creates `apps/api/prisma/migrations/<ts>_add_meal_plan_visibility/`, applies it, regenerates the client. Exit 0.

- [ ] **Step 2: shared-types + build**

In `packages/shared-types/src/v1/meal-plan.ts`, add to the `MealPlan` interface (after `aiGenerated: boolean;`):

```ts
  visibleToPatient: boolean;
```

Append (near the request types):

```ts
export interface SetMealPlanVisibilityRequest {
  visibleToPatient: boolean;
}
```

Run: `pnpm --filter @nutri-plus/shared-types build` → exit 0.

- [ ] **Step 3: Write the failing service tests**

Add to `apps/api/src/meal-plans/meal-plans.service.spec.ts` (reuse the file's existing `mockDeep`/patient-ctx helpers; if a patient-ctx helper isn't present, add one shaped like the others with `role: 'PATIENT'`, `patientProfile: { id: 'pp-1' }`):

```ts
describe('patient visibility', () => {
  it('listMyPlans filters to visible plans only', async () => {
    prisma.mealPlan.findMany.mockResolvedValue([] as any);
    await service.listMyPlans(patientCtx('pp-1'));
    expect(prisma.mealPlan.findMany).toHaveBeenCalledWith({
      where: { patientId: 'pp-1', visibleToPatient: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('getMyPlan requires the plan to be visible', async () => {
    prisma.mealPlan.findFirst.mockResolvedValue({ id: 'm1' } as any);
    await service.getMyPlan(patientCtx('pp-1'), 'm1');
    expect(prisma.mealPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1', patientId: 'pp-1', visibleToPatient: true },
      }),
    );
  });

  it('setVisibility checks ownership then updates only the flag', async () => {
    prisma.mealPlan.findFirst.mockResolvedValue({ id: 'm1' } as any); // requireOwnedPlan
    prisma.mealPlan.update.mockResolvedValue({ id: 'm1', visibleToPatient: true } as any);
    await service.setVisibility(nutriCtx, 'm1', true);
    expect(prisma.mealPlan.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { visibleToPatient: true },
    });
  });
});
```

(Use the spec's existing nutritionist ctx for `nutriCtx`; define `patientCtx(id)` returning an `AuthContext` with `user.role: 'PATIENT'`, `user.patientProfile: { id }`.)

- [ ] **Step 4: Run tests → fail**

Run: `pnpm --filter @nutri-plus/api exec jest meal-plans.service.spec`
Expected: FAIL — `setVisibility` undefined; filters missing `visibleToPatient`.

- [ ] **Step 5: Service changes**

In `apps/api/src/meal-plans/meal-plans.service.ts`, add `visibleToPatient: true` to both patient reads:

```ts
  async listMyPlans(ctx: AuthContext) {
    return this.prisma.mealPlan.findMany({
      where: { patientId: this.patientProfileId(ctx), visibleToPatient: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyPlan(ctx: AuthContext, id: string) {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id, patientId: this.patientProfileId(ctx), visibleToPatient: true },
      include: FULL_TREE,
    });
    if (!plan) {
      throw new NotFoundException('Meal plan not found');
    }
    return plan;
  }
```

Add the write (near `deletePlan`, nutritionist surface):

```ts
  async setVisibility(ctx: AuthContext, id: string, visibleToPatient: boolean) {
    await this.requireOwnedPlan(ctx, id);
    return this.prisma.mealPlan.update({
      where: { id },
      data: { visibleToPatient },
    });
  }
```

- [ ] **Step 6: DTO + controller route**

Create `apps/api/src/meal-plans/dto/set-visibility.dto.ts`:

```ts
import { IsBoolean } from 'class-validator';

export class SetVisibilityDto {
  @IsBoolean()
  visibleToPatient!: boolean;
}
```

In `apps/api/src/meal-plans/meal-plans.controller.ts`, import the DTO and add (after `@Patch(':id')`):

```ts
  @Patch(':id/visibility')
  @Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
  setVisibility(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() dto: SetVisibilityDto,
  ) {
    return this.mealPlans.setVisibility(ctx, id, dto.visibleToPatient);
  }
```

- [ ] **Step 7: Run tests → pass + full API suite**

Run: `pnpm --filter @nutri-plus/api exec jest meal-plans.service.spec` → PASS.
Run: `pnpm --filter @nutri-plus/api test` → all green (190 prior + new).

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared-types/src/v1/meal-plan.ts apps/api/src/meal-plans/
git commit -m "feat(api): meal-plan visibleToPatient flag + PATCH visibility + patient read filter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Web — per-plan visibility toggle

**Files:**
- Modify: `apps/web/src/lib/api/meal-plans.ts`
- Modify: `apps/web/src/lib/queries/meal-plans.ts`
- Modify: `apps/web/src/components/patients/meal-plans-section.tsx`
- Test: `apps/web/src/components/patients/meal-plans-section.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `SetMealPlanVisibilityRequest`, `MealPlanSummary.visibleToPatient`, `browserApiFetch`.
- Produces: `setMealPlanVisibility(id, visibleToPatient)`; `useSetMealPlanVisibility(patientId)`.

- [ ] **Step 1: API fn**

Append to `apps/web/src/lib/api/meal-plans.ts`:

```ts
export function setMealPlanVisibility(id: string, visibleToPatient: boolean): Promise<MealPlan> {
  return browserApiFetch<MealPlan>(`/meal-plans/${id}/visibility`, {
    method: 'PATCH',
    body: { visibleToPatient },
  });
}
```

- [ ] **Step 2: Query mutation**

In `apps/web/src/lib/queries/meal-plans.ts`, add `setMealPlanVisibility` to the import from `@/lib/api/meal-plans`, then add:

```ts
export function useSetMealPlanVisibility(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, visibleToPatient }: { id: string; visibleToPatient: boolean }) =>
      setMealPlanVisibility(id, visibleToPatient),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal-plans', patientId] }),
  });
}
```

- [ ] **Step 3: Write the failing component test**

Create/extend `apps/web/src/components/patients/meal-plans-section.test.tsx`. Mock the query + mutation hooks and assert the toggle calls the mutation:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const mockMutate = vi.fn();
vi.mock('@/lib/queries/meal-plans', () => ({
  useMealPlans: () => ({
    data: [
      { id: 'm1', title: 'Plano A', objective: 'Emagrecer', createdAt: '2026-01-01', aiGenerated: false, targetCalories: null, visibleToPatient: false },
    ],
    isLoading: false,
    isError: false,
  }),
  useSetMealPlanVisibility: () => ({ mutate: mockMutate, isPending: false }),
}));
vi.mock('@/components/patients/ai-generate-dialog', () => ({ AiGenerateDialog: () => null }));

import { MealPlansSection } from './meal-plans-section';

describe('MealPlansSection visibility toggle', () => {
  it('toggles a hidden plan to visible', () => {
    render(<MealPlansSection patientId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: /disponibilizar/i }));
    expect(mockMutate).toHaveBeenCalledWith({ id: 'm1', visibleToPatient: true });
  });
});
```

- [ ] **Step 4: Run → fail**

Run: `pnpm --filter @nutri-plus/web exec vitest run src/components/patients/meal-plans-section.test.tsx`
Expected: FAIL — no "Disponibilizar" button.

- [ ] **Step 5: Add the toggle to the section**

In `meal-plans-section.tsx`: import `useSetMealPlanVisibility` from `@/lib/queries/meal-plans`; call `const visibility = useSetMealPlanVisibility(patientId);` in the component. Change each plan row from a bare `<Link>` to a flex container holding the navigating `<Link>` plus (when `canEdit`) a toggle Button that does NOT navigate:

```tsx
{plans.map((p: MealPlanSummary) => (
  <div key={p.id} className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:bg-muted/40">
    <Link href={`/patients/${patientId}/planos/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{p.title ?? 'Sem título'}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {p.objective ?? '—'} · {formatDate(p.createdAt)}
          {p.targetCalories != null && ` · ${p.targetCalories} kcal`}
        </span>
      </span>
      {p.aiGenerated && (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-secondary-foreground">
          IA
        </span>
      )}
    </Link>
    {canEdit && (
      <Button
        type="button"
        size="sm"
        variant={p.visibleToPatient ? 'default' : 'outline'}
        className="shrink-0 rounded-full"
        disabled={visibility.isPending}
        onClick={() => visibility.mutate({ id: p.id, visibleToPatient: !p.visibleToPatient })}
      >
        {p.visibleToPatient ? 'Disponível ✓' : 'Disponibilizar'}
      </Button>
    )}
  </div>
))}
```

- [ ] **Step 6: Run → pass + full web suite**

Run: `pnpm --filter @nutri-plus/web exec vitest run src/components/patients/meal-plans-section.test.tsx` → PASS.
Run: `pnpm --filter @nutri-plus/web test` → all green (273 prior + new).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api/meal-plans.ts apps/web/src/lib/queries/meal-plans.ts apps/web/src/components/patients/meal-plans-section.tsx apps/web/src/components/patients/meal-plans-section.test.tsx
git commit -m "feat(web): per-plan 'disponibilizar para o paciente' toggle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## PART B — App: view + PDF (api + mobile)

### Task 3: API — patient-scoped PDF endpoint

**Files:**
- Modify: `apps/api/src/meal-plans/meal-plan-pdf.service.ts` (add `generateForPatient`, extract shared build)
- Modify: `apps/api/src/meal-plans/patient-meal-plans.controller.ts` (add `GET :id/pdf`)
- Test: `apps/api/src/meal-plans/meal-plan-pdf.service.spec.ts` (create if absent)

**Interfaces:**
- Consumes: `MealPlansService.getMyPlan(ctx,id)` (scoped + visible), `PrismaService`, `buildMealPlanDocDefinition`, `renderPdf`.
- Produces: `MealPlanPdfService.generateForPatient(ctx, id): Promise<Buffer>`; `GET /v1/me/meal-plans/:id/pdf`.

- [ ] **Step 1: Write the failing service test**

Create `apps/api/src/meal-plans/meal-plan-pdf.service.spec.ts`:

```ts
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { MealPlansService } from './meal-plans.service';
import { MealPlanPdfService } from './meal-plan-pdf.service';
import { AuthContext } from '../auth/types/auth-context';

jest.mock('./pdf/pdf-printer', () => ({ renderPdf: jest.fn().mockResolvedValue(Buffer.from('PDF')) }));
jest.mock('./pdf/meal-plan-doc', () => ({ buildMealPlanDocDefinition: jest.fn().mockReturnValue({}) }));

const patientCtx = { authProviderId: 's', email: 'p@x.com', name: 'Ana', user: { id: 'u', role: 'PATIENT', patientProfile: { id: 'pp-1' } } } as unknown as AuthContext;

describe('MealPlanPdfService.generateForPatient', () => {
  it('reads via getMyPlan and resolves branding from the patient nutritionist', async () => {
    const prisma = mockDeep<PrismaService>();
    const mealPlans = mockDeep<MealPlansService>();
    mealPlans.getMyPlan.mockResolvedValue({ id: 'm1', patientId: 'pp-1', meals: [] } as any);
    prisma.patientProfile.findUnique.mockResolvedValue({ nutritionistId: 'nut-1' } as any);
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ displayName: 'Dra X', logoUrl: null } as any);

    const svc = new MealPlanPdfService(prisma, mealPlans);
    const buf = await svc.generateForPatient(patientCtx, 'm1');

    expect(mealPlans.getMyPlan).toHaveBeenCalledWith(patientCtx, 'm1');
    expect(prisma.patientProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'pp-1' },
      select: { nutritionistId: true },
    });
    expect(prisma.nutritionistProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'nut-1' },
      select: { displayName: true, logoUrl: true },
    });
    expect(buf).toEqual(Buffer.from('PDF'));
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @nutri-plus/api exec jest meal-plan-pdf.service.spec`
Expected: FAIL — `generateForPatient` undefined.

- [ ] **Step 3: Refactor the service + add `generateForPatient`**

Rewrite `apps/api/src/meal-plans/meal-plan-pdf.service.ts` so both entry points share one build helper:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { MealPlansService } from './meal-plans.service';
import { buildMealPlanDocDefinition, PdfMealPlan } from './pdf/meal-plan-doc';
import { renderPdf } from './pdf/pdf-printer';

@Injectable()
export class MealPlanPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mealPlans: MealPlansService,
  ) {}

  // Nutritionist/employee: branding from the caller's own nutritionist scope.
  async generate(ctx: AuthContext, id: string): Promise<Buffer> {
    const plan = await this.mealPlans.getPlan(ctx, id);
    return this.build(plan, resolveScopeNutritionistId(ctx));
  }

  // Patient: plan read via the patient-scoped (visible-only) getMyPlan; branding
  // from the plan's own patient's nutritionist (the caller has no nutritionist scope).
  async generateForPatient(ctx: AuthContext, id: string): Promise<Buffer> {
    const plan = await this.mealPlans.getMyPlan(ctx, id);
    const owner = await this.prisma.patientProfile.findUnique({
      where: { id: plan.patientId },
      select: { nutritionistId: true },
    });
    return this.build(plan, owner?.nutritionistId ?? null);
  }

  private async build(plan: unknown, nutritionistId: string | null): Promise<Buffer> {
    const branding = nutritionistId
      ? await this.prisma.nutritionistProfile.findUnique({
          where: { id: nutritionistId },
          select: { displayName: true, logoUrl: true },
        })
      : null;
    const logoDataUrl = await this.fetchLogo(branding?.logoUrl ?? null);
    const doc = buildMealPlanDocDefinition(plan as PdfMealPlan, {
      displayName: branding?.displayName ?? null,
      logoDataUrl,
    });
    return renderPdf(doc);
  }

  private async fetchLogo(logoUrl: string | null): Promise<string | null> {
    if (!logoUrl) return null;
    try {
      const res = await fetch(logoUrl);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'image/png';
      return `data:${contentType};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Patient controller route**

In `apps/api/src/meal-plans/patient-meal-plans.controller.ts`, add imports `Header, StreamableFile` from `@nestjs/common` and the service, inject `MealPlanPdfService`, and add:

```ts
  @Get(':id/pdf')
  async pdf(@CurrentUser() ctx: AuthContext, @Param('id') id: string): Promise<StreamableFile> {
    const buffer = await this.mealPlanPdf.generateForPatient(ctx, id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: 'attachment; filename="plano-alimentar.pdf"',
    });
  }
```

(Mirror the nutritionist controller's `pdf` handler exactly. `MealPlanPdfService` is already provided by `MealPlansModule`.)

- [ ] **Step 5: Run → pass + full API suite**

Run: `pnpm --filter @nutri-plus/api exec jest meal-plan-pdf.service.spec` → PASS.
Run: `pnpm --filter @nutri-plus/api test` → all green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/meal-plans/meal-plan-pdf.service.ts apps/api/src/meal-plans/patient-meal-plans.controller.ts apps/api/src/meal-plans/meal-plan-pdf.service.spec.ts
git commit -m "feat(api): patient-scoped GET /me/meal-plans/:id/pdf

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Mobile — meal-plan data layer + PDF download

**Files:**
- Modify: `apps/mobile/package.json` (+ lockfile) — `expo-file-system`, `expo-sharing`
- Create: `apps/mobile/lib/queries/meal-plans.ts`
- Test: `apps/mobile/lib/queries/meal-plans.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (`../api`), `supabase` (`../supabase`), `MealPlan`/`MealPlanSummary`, `expo-file-system`, `expo-sharing`.
- Produces: `useMyMealPlans()` (`['me','meal-plans']` → `MealPlanSummary[]`), `useMyMealPlan(id)` (`['me','meal-plans',id]` → `MealPlan`), `downloadMealPlanPdf(id): Promise<void>`.

- [ ] **Step 1: Install the Expo modules**

Run: `pnpm --filter @nutri-plus/mobile exec npx expo install expo-file-system expo-sharing`
Expected: both added to `apps/mobile/package.json` dependencies at SDK-54-compatible versions.

- [ ] **Step 2: Write the failing test**

Create `apps/mobile/lib/queries/meal-plans.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

const mockApiFetch = jest.fn();
jest.mock('../api', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const mockGetSession = jest.fn();
jest.mock('../supabase', () => ({ supabase: { auth: { getSession: () => mockGetSession() } } }));

const mockDownloadAsync = jest.fn();
jest.mock('expo-file-system', () => ({ cacheDirectory: 'file:///cache/', downloadAsync: (...a: unknown[]) => mockDownloadAsync(...a) }));
const mockIsAvailable = jest.fn();
const mockShareAsync = jest.fn();
jest.mock('expo-sharing', () => ({ isAvailableAsync: () => mockIsAvailable(), shareAsync: (...a: unknown[]) => mockShareAsync(...a) }));

import { useMyMealPlans, downloadMealPlanPdf } from './meal-plans';

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue([{ id: 'm1', title: 'Plano A' }]);
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  mockDownloadAsync.mockReset().mockResolvedValue({ uri: 'file:///cache/plano-alimentar.pdf' });
  mockIsAvailable.mockReset().mockResolvedValue(true);
  mockShareAsync.mockReset().mockResolvedValue(undefined);
});

function Probe() {
  const q = useMyMealPlans();
  return <Text>{q.isSuccess ? `n:${q.data.length}` : 'loading'}</Text>;
}

describe('meal-plans data layer', () => {
  it('useMyMealPlans loads /me/meal-plans', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    await render(<Probe />, { wrapper });
    expect(await screen.findByText('n:1')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/me/meal-plans');
  });

  it('downloadMealPlanPdf downloads with the bearer token then shares', async () => {
    await downloadMealPlanPdf('m1');
    expect(mockDownloadAsync).toHaveBeenCalledWith(
      expect.stringContaining('/v1/me/meal-plans/m1/pdf'),
      'file:///cache/plano-alimentar.pdf',
      { headers: { Authorization: 'Bearer tok' } },
    );
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///cache/plano-alimentar.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });
});
```

- [ ] **Step 3: Run → fail**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/queries/meal-plans.test.tsx`
Expected: FAIL — `./meal-plans` not found.

- [ ] **Step 4: Implement the data layer**

Create `apps/mobile/lib/queries/meal-plans.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { MealPlan, MealPlanSummary } from '@nutri-plus/shared-types';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiFetch } from '../api';
import { supabase } from '../supabase';

export function useMyMealPlans() {
  return useQuery({
    queryKey: ['me', 'meal-plans'],
    queryFn: () => apiFetch<MealPlanSummary[]>('/me/meal-plans'),
  });
}

export function useMyMealPlan(id: string) {
  return useQuery({
    queryKey: ['me', 'meal-plans', id],
    queryFn: () => apiFetch<MealPlan>(`/me/meal-plans/${id}`),
    enabled: Boolean(id),
  });
}

// Downloads the authenticated PDF to a cache file, then opens the OS share sheet.
export async function downloadMealPlanPdf(id: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const base = process.env.EXPO_PUBLIC_API_URL;
  const url = `${base}/v1/me/meal-plans/${id}/pdf`;
  const target = `${FileSystem.cacheDirectory}plano-alimentar.pdf`;
  const { uri } = await FileSystem.downloadAsync(url, target, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}
```

- [ ] **Step 5: Run → pass; tsc; full suite**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/queries/meal-plans.test.tsx` → PASS.
Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (no output) and `pnpm --filter @nutri-plus/mobile test` (green).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/lib/queries/meal-plans.ts apps/mobile/lib/queries/meal-plans.test.tsx
git commit -m "feat(mobile): meal-plan data layer + PDF download/share

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Mobile — `MealPlanView` component

**Files:**
- Create: `apps/mobile/components/meal-plan/meal-plan-view.tsx`
- Test: `apps/mobile/components/meal-plan/meal-plan-view.test.tsx`

**Interfaces:**
- Consumes: `useMyMealPlan(planId)`, `downloadMealPlanPdf(planId)` (Task 4), `Screen`, `Button`, `MealPlan` type.
- Produces: `MealPlanView({ planId }: { planId: string })`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/components/meal-plan/meal-plan-view.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockUseMyMealPlan = jest.fn();
const mockDownload = jest.fn();
jest.mock('../../lib/queries/meal-plans', () => ({
  useMyMealPlan: () => mockUseMyMealPlan(),
  downloadMealPlanPdf: (...a: unknown[]) => mockDownload(...a),
}));

import { MealPlanView } from './meal-plan-view';

const plan = {
  id: 'm1',
  title: 'Plano de Emagrecimento',
  objective: 'Emagrecer',
  targetCalories: 1800,
  targetProtein: 120,
  targetCarbs: 180,
  targetFats: 60,
  meals: [
    { id: 'meal1', name: 'Café da manhã', timeLabel: '08:00', instructions: null, order: 0,
      options: [{ id: 'o1', label: 'Opção 1', order: 0, items: [
        { id: 'i1', foodName: 'Ovos', quantity: '2 un', calories: 140, protein: 12, carbs: 1, fats: 10, order: 0 },
      ] }] },
  ],
};

beforeEach(() => {
  mockUseMyMealPlan.mockReset();
  mockDownload.mockReset().mockResolvedValue(undefined);
});

describe('MealPlanView', () => {
  it('shows a loading state', async () => {
    mockUseMyMealPlan.mockReturnValue({ isLoading: true });
    await render(<MealPlanView planId="m1" />);
    expect(screen.getByTestId('meal-plan-loading')).toBeTruthy();
  });

  it('renders the plan tree and downloads the PDF', async () => {
    mockUseMyMealPlan.mockReturnValue({ isLoading: false, isError: false, data: plan });
    await render(<MealPlanView planId="m1" />);
    expect(screen.getByText('Plano de Emagrecimento')).toBeTruthy();
    expect(screen.getByText('Café da manhã')).toBeTruthy();
    expect(screen.getByText('Ovos')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /baixar pdf/i }));
    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('m1'));
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @nutri-plus/mobile exec jest components/meal-plan/meal-plan-view.test.tsx`
Expected: FAIL — `./meal-plan-view` not found.

- [ ] **Step 3: Implement the component**

Create `apps/mobile/components/meal-plan/meal-plan-view.tsx`:

```tsx
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Screen } from '../ui/screen';
import { Button } from '../ui/button';
import { useMyMealPlan, downloadMealPlanPdf } from '../../lib/queries/meal-plans';

function fmt(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : String(v);
}

export function MealPlanView({ planId }: { planId: string }) {
  const query = useMyMealPlan(planId);
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  if (query.isLoading) {
    return (
      <View testID="meal-plan-loading" className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#14bfa6" />
      </View>
    );
  }
  if (query.isError || !query.data) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="font-sans text-center text-base text-muted-foreground">
          Não foi possível carregar o plano.
        </Text>
        <Button label="Tentar de novo" onPress={() => query.refetch()} />
      </View>
    );
  }

  const plan = query.data;

  async function onDownload() {
    setPdfError(null);
    setDownloading(true);
    try {
      await downloadMealPlanPdf(planId);
    } catch {
      setPdfError('Não foi possível baixar o PDF. Tente novamente.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-6">
        <View className="gap-1">
          <Text className="font-heading text-2xl text-foreground">{plan.title ?? 'Plano alimentar'}</Text>
          {plan.objective ? (
            <Text className="font-sans text-base text-muted-foreground">{plan.objective}</Text>
          ) : null}
          {plan.targetCalories != null ? (
            <Text className="font-sans text-sm text-muted-foreground">
              Metas: {fmt(plan.targetCalories)} kcal · P {fmt(plan.targetProtein)}g · C {fmt(plan.targetCarbs)}g · G {fmt(plan.targetFats)}g
            </Text>
          ) : null}
        </View>

        {plan.meals.map((meal) => (
          <View key={meal.id} className="gap-2 rounded-xl border border-border bg-card p-4">
            <Text className="font-heading-semibold text-lg text-foreground">
              {meal.timeLabel ? `${meal.timeLabel} · ` : ''}{meal.name ?? 'Refeição'}
            </Text>
            {meal.instructions ? (
              <Text className="font-sans text-sm text-muted-foreground">{meal.instructions}</Text>
            ) : null}
            {meal.options.map((opt) => (
              <View key={opt.id} className="gap-1 border-t border-border pt-2">
                {opt.label ? (
                  <Text className="font-sans-medium text-sm text-primary">{opt.label}</Text>
                ) : null}
                {opt.items.map((it) => (
                  <View key={it.id} className="flex-row justify-between">
                    <Text className="font-sans text-sm text-foreground">
                      {it.foodName ?? '—'}{it.quantity ? ` · ${it.quantity}` : ''}
                    </Text>
                    {it.calories != null ? (
                      <Text className="font-sans text-xs text-muted-foreground">{fmt(it.calories)} kcal</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}

        {pdfError ? <Text className="font-sans text-sm text-destructive">{pdfError}</Text> : null}
        <Button label="Baixar PDF" onPress={onDownload} loading={downloading} />
      </View>
    </Screen>
  );
}
```

- [ ] **Step 4: Run → pass; tsc; full suite**

Run: `pnpm --filter @nutri-plus/mobile exec jest components/meal-plan/meal-plan-view.test.tsx` → PASS.
Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` and `pnpm --filter @nutri-plus/mobile test`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/meal-plan/
git commit -m "feat(mobile): MealPlanView (render plan tree + Baixar PDF)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Mobile — Planos tab as a Stack (0 / auto-1 / picker)

**Files:**
- Delete: `apps/mobile/app/(app)/planos.tsx`
- Create: `apps/mobile/app/(app)/planos/_layout.tsx`, `apps/mobile/app/(app)/planos/index.tsx`, `apps/mobile/app/(app)/planos/[id].tsx`
- Test: `apps/mobile/app/(app)/planos/planos-index.test.tsx`

**Interfaces:**
- Consumes: `useMyMealPlans()`, `MealPlanView` (Task 5), `MealPlanSummary`, expo-router `Stack`/`Link`/`useLocalSearchParams`.
- Produces: the `planos` route group (tab name stays `planos`).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/(app)/planos/planos-index.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';

const mockUseMyMealPlans = jest.fn();
jest.mock('../../../lib/queries/meal-plans', () => ({ useMyMealPlans: () => mockUseMyMealPlans() }));
jest.mock('../../../components/meal-plan/meal-plan-view', () => ({
  MealPlanView: ({ planId }: { planId: string }) => {
    const { Text } = require('react-native');
    return <Text>view:{planId}</Text>;
  },
}));
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: unknown }) => children,
}));

import PlanosIndex from './index';

beforeEach(() => mockUseMyMealPlans.mockReset());

describe('Planos index', () => {
  it('empty state when no visible plans', async () => {
    mockUseMyMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [] });
    await render(<PlanosIndex />);
    expect(screen.getByText('Nenhum plano disponível ainda.')).toBeTruthy();
  });

  it('auto-opens the single plan inline', async () => {
    mockUseMyMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [{ id: 'm1', title: 'A' }] });
    await render(<PlanosIndex />);
    expect(screen.getByText('view:m1')).toBeTruthy();
  });

  it('shows a picker for more than one plan', async () => {
    mockUseMyMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [{ id: 'm1', title: 'A' }, { id: 'm2', title: 'B' }] });
    await render(<PlanosIndex />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.queryByText('view:m1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(app\)/planos/planos-index.test.tsx"`
Expected: FAIL — `./index` not found.

- [ ] **Step 3: Create the stack + screens; delete the flat file**

Run: `git rm "apps/mobile/app/(app)/planos.tsx"`.

Create `apps/mobile/app/(app)/planos/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function PlanosLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

Create `apps/mobile/app/(app)/planos/index.tsx`:

```tsx
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import type { MealPlanSummary } from '@nutri-plus/shared-types';
import { Screen } from '../../../components/ui/screen';
import { Button } from '../../../components/ui/button';
import { MealPlanView } from '../../../components/meal-plan/meal-plan-view';
import { useMyMealPlans } from '../../../lib/queries/meal-plans';

function formatDate(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

export default function PlanosIndex() {
  const query = useMyMealPlans();

  if (query.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#14bfa6" />
      </View>
    );
  }
  if (query.isError || !query.data) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="font-sans text-center text-base text-muted-foreground">
          Não foi possível carregar seus planos.
        </Text>
        <Button label="Tentar de novo" onPress={() => query.refetch()} />
      </View>
    );
  }

  const plans = query.data;

  if (plans.length === 0) {
    return (
      <Screen contentContainerClassName="grow justify-center p-6">
        <Text className="font-sans text-center text-base text-muted-foreground">
          Nenhum plano disponível ainda.
        </Text>
      </Screen>
    );
  }

  if (plans.length === 1) {
    return <MealPlanView planId={plans[0].id} />;
  }

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-3">
        <Text className="font-heading text-2xl text-foreground">Seus planos</Text>
        {plans.map((p: MealPlanSummary) => (
          <Link key={p.id} href={{ pathname: '/planos/[id]', params: { id: p.id } }} asChild>
            <Pressable className="gap-1 rounded-xl border border-border bg-card p-4">
              <Text className="font-sans-medium text-base text-foreground">{p.title ?? 'Plano alimentar'}</Text>
              <Text className="font-sans text-sm text-muted-foreground">
                {(p.objective ?? '—') + ' · ' + formatDate(p.createdAt)}
              </Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </Screen>
  );
}
```

Create `apps/mobile/app/(app)/planos/[id].tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { MealPlanView } from '../../../components/meal-plan/meal-plan-view';

export default function PlanoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MealPlanView planId={id} />;
}
```

- [ ] **Step 4: Regenerate typed routes, run tests, tsc**

Run: `pnpm --filter @nutri-plus/mobile exec npx expo customize tsconfig.json` (regenerates `.expo/types/router.d.ts` with `/planos` + `/planos/[id]`).
Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(app\)/planos/planos-index.test.tsx"` → PASS.
Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (no output — the `/planos/[id]` Link href now typechecks) and `pnpm --filter @nutri-plus/mobile test` (all green; the tab still names `planos`).

- [ ] **Step 5: Commit**

```bash
git add -A "apps/mobile/app/(app)/planos" "apps/mobile/app/(app)/planos.tsx"
git commit -m "feat(mobile): Planos stack — auto-open 1 / picker for many

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## PART C — "Fora de casa" AI assistant (api + mobile)

### Task 7: API — outside-home model + endpoint + AI

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`OutsideHomeRequest` + back-relation) + migration
- Modify: `packages/shared-types/src/v1/` (new `outside-home.ts` + export)
- Create: `apps/api/src/outside-home/{outside-home.module.ts,outside-home.controller.ts,outside-home.service.ts,dto/create-outside-home.dto.ts}`, `apps/api/src/ai/prompts/outside-home.prompt.ts`
- Modify: `apps/api/src/app.module.ts` (register the module)
- Test: `apps/api/src/outside-home/outside-home.service.spec.ts`

**Interfaces:**
- Consumes: `OpenAIProvider.generateStructured`, `resolveScopePatientId`, `PrismaService`, `FULL_TREE`-equivalent include, `AIInteractionType.OUTSIDE_HOME_SUGGESTION`.
- Produces: `POST /v1/me/outside-home { message }` → `{ suggestion: string }`; `OutsideHomeService.suggest(ctx, dto)`.

- [ ] **Step 1: Prisma model + migration**

In `apps/api/prisma/schema.prisma`, add the model and a back-relation on `PatientProfile` (match the file's relation style — `PatientProfile` already back-relates to `MealPlan`/`BodyAssessment`; add `outsideHomeRequests OutsideHomeRequest[]`):

```prisma
model OutsideHomeRequest {
  id           String   @id @default(uuid())
  patientId    String
  patient      PatientProfile @relation(fields: [patientId], references: [id])
  message      String
  aiSuggestion String
  createdAt    DateTime @default(now())

  @@index([patientId, createdAt])
}
```

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name add_outside_home_request` → creates + applies + regenerates the client. Exit 0.

- [ ] **Step 2: shared-types + build**

Create `packages/shared-types/src/v1/outside-home.ts`:

```ts
export interface CreateOutsideHomeRequest {
  message: string;
}

export interface OutsideHomeSuggestion {
  suggestion: string;
}
```

In `packages/shared-types/src/v1/index.ts` add `export * from './outside-home';`. Run `pnpm --filter @nutri-plus/shared-types build` → exit 0.

- [ ] **Step 3: Prompt builder**

Create `apps/api/src/ai/prompts/outside-home.prompt.ts` (pure builder, mirrors `meal-plan.prompt.ts`):

```ts
export interface OutsideHomePromptContext {
  objective: string | null;
  restrictions: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  patientNotes: string | null;
  currentPlanSummary: string | null; // compact text of the latest visible plan, or null
  message: string;
}

export const OUTSIDE_HOME_SYSTEM_PROMPT = [
  'Você é um assistente de nutrição prático para quando o paciente está fora de casa.',
  'Dada a situação do paciente, sugira o que comer de forma CONCISA e ACIONÁVEL.',
  'Alinhe a sugestão ao objetivo, restrições, alergias e ao plano alimentar atual quando houver.',
  'NÃO faça alegações médicas nem diagnósticos. Não invente valores nutricionais exatos.',
  'Responda em português do Brasil, em poucas frases.',
].join(' ');

export function buildOutsideHomeUserPrompt(ctx: OutsideHomePromptContext): string {
  return JSON.stringify(ctx);
}
```

- [ ] **Step 4: Write the failing service test**

Create `apps/api/src/outside-home/outside-home.service.spec.ts`:

```ts
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIProvider } from '../ai/openai.provider';
import { OutsideHomeService } from './outside-home.service';
import { AuthContext } from '../auth/types/auth-context';
import { AIInteractionType } from '../generated/prisma/client';

const patientCtx = { authProviderId: 's', email: 'p@x.com', name: 'Ana', user: { id: 'u', role: 'PATIENT', patientProfile: { id: 'pp-1' } } } as unknown as AuthContext;

describe('OutsideHomeService.suggest', () => {
  it('builds context, calls the AI, persists, and returns the suggestion', async () => {
    const prisma = mockDeep<PrismaService>();
    const provider = mockDeep<OpenAIProvider>();
    prisma.patientProfile.findUnique.mockResolvedValue({ objective: 'EMAGRECER', restrictions: null, allergies: null, medicalConditions: null, notes: null } as any);
    prisma.mealPlan.findFirst.mockResolvedValue(null as any); // no visible plan
    provider.generateStructured.mockResolvedValue({ suggestion: 'Peça grelhado com salada.' } as any);

    const svc = new OutsideHomeService(prisma, provider);
    const result = await svc.suggest(patientCtx, { message: 'Estou num hamburgueria' });

    expect(provider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'fast', type: AIInteractionType.OUTSIDE_HOME_SUGGESTION, patientId: 'pp-1' }),
    );
    expect(prisma.outsideHomeRequest.create).toHaveBeenCalledWith({
      data: { patientId: 'pp-1', message: 'Estou num hamburgueria', aiSuggestion: 'Peça grelhado com salada.' },
    });
    expect(result).toEqual({ suggestion: 'Peça grelhado com salada.' });
  });
});
```

- [ ] **Step 5: Run → fail**

Run: `pnpm --filter @nutri-plus/api exec jest outside-home.service.spec`
Expected: FAIL — module not found.

- [ ] **Step 6: DTO, service, controller, module, registration**

Create `apps/api/src/outside-home/dto/create-outside-home.dto.ts`:

```ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateOutsideHomeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message!: string;
}
```

Create `apps/api/src/outside-home/outside-home.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIProvider } from '../ai/openai.provider';
import { AuthContext } from '../auth/types/auth-context';
import { AIInteractionType } from '../generated/prisma/client';
import { resolveScopePatientId } from '../auth/auth-scope';
import { CreateOutsideHomeDto } from './dto/create-outside-home.dto';
import {
  OUTSIDE_HOME_SYSTEM_PROMPT,
  buildOutsideHomeUserPrompt,
} from '../ai/prompts/outside-home.prompt';

const suggestionSchema = z.object({ suggestion: z.string() });

@Injectable()
export class OutsideHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: OpenAIProvider,
  ) {}

  async suggest(ctx: AuthContext, dto: CreateOutsideHomeDto) {
    const patientId = resolveScopePatientId(ctx);

    const profile = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: {
        objective: true,
        restrictions: true,
        allergies: true,
        medicalConditions: true,
        notes: true,
      },
    });

    const plan = await this.prisma.mealPlan.findFirst({
      where: { patientId, visibleToPatient: true },
      orderBy: { createdAt: 'desc' },
      select: { title: true, objective: true },
    });

    const { suggestion } = await this.provider.generateStructured({
      tier: 'fast',
      system: OUTSIDE_HOME_SYSTEM_PROMPT,
      user: buildOutsideHomeUserPrompt({
        objective: profile?.objective ?? null,
        restrictions: profile?.restrictions ?? null,
        allergies: profile?.allergies ?? null,
        medicalConditions: profile?.medicalConditions ?? null,
        patientNotes: profile?.notes ?? null,
        currentPlanSummary: plan ? `${plan.title ?? 'Plano'} — ${plan.objective ?? ''}`.trim() : null,
        message: dto.message,
      }),
      schema: suggestionSchema,
      schemaName: 'outside_home_suggestion',
      type: AIInteractionType.OUTSIDE_HOME_SUGGESTION,
      patientId,
    });

    await this.prisma.outsideHomeRequest.create({
      data: { patientId, message: dto.message, aiSuggestion: suggestion },
    });

    return { suggestion };
  }
}
```

Create `apps/api/src/outside-home/outside-home.controller.ts`:

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { OutsideHomeService } from './outside-home.service';
import { CreateOutsideHomeDto } from './dto/create-outside-home.dto';

@ApiTags('outside-home')
@ApiBearerAuth()
@Controller({ path: 'me/outside-home', version: '1' })
@Roles(UserRole.PATIENT)
export class OutsideHomeController {
  constructor(private readonly outsideHome: OutsideHomeService) {}

  @Post()
  suggest(@CurrentUser() ctx: AuthContext, @Body() dto: CreateOutsideHomeDto) {
    return this.outsideHome.suggest(ctx, dto);
  }
}
```

Create `apps/api/src/outside-home/outside-home.module.ts` (mirror `MealGenerationModule`; `PrismaModule` is `@Global()`, so it is NOT imported here — `PrismaService` is available app-wide):

```ts
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { OutsideHomeController } from './outside-home.controller';
import { OutsideHomeService } from './outside-home.service';

@Module({
  imports: [AiModule],
  controllers: [OutsideHomeController],
  providers: [OutsideHomeService],
})
export class OutsideHomeModule {}
```

Register `OutsideHomeModule` in `apps/api/src/app.module.ts` — add the import and list it in `imports` next to `MealGenerationModule`.

- [ ] **Step 7: Run → pass + full API suite**

Run: `pnpm --filter @nutri-plus/api exec jest outside-home.service.spec` → PASS.
Run: `pnpm --filter @nutri-plus/api test` → all green (`app.module.spec` boots with the new module).

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma packages/shared-types/src/v1 apps/api/src/outside-home apps/api/src/ai/prompts/outside-home.prompt.ts apps/api/src/app.module.ts
git commit -m "feat(api): outside-home AI suggestion (POST /me/outside-home)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Mobile — "Fora de casa" tab

**Files:**
- Modify: `apps/mobile/app/(app)/_layout.tsx` (add the 4th tab)
- Create: `apps/mobile/app/(app)/fora-de-casa.tsx`, `apps/mobile/lib/queries/outside-home.ts`
- Test: `apps/mobile/lib/queries/outside-home.test.tsx`, `apps/mobile/app/(app)/fora-de-casa.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `Screen`/`TextField`/`Button`, `CreateOutsideHomeRequest`/`OutsideHomeSuggestion`, `Ionicons`.
- Produces: `useOutsideHome()` mutation; the `fora-de-casa` tab screen.

- [ ] **Step 1: Write the failing data-layer test**

Create `apps/mobile/lib/queries/outside-home.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Text, Pressable } from 'react-native';

const mockApiFetch = jest.fn();
jest.mock('../api', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

import { useOutsideHome } from './outside-home';

beforeEach(() => mockApiFetch.mockReset().mockResolvedValue({ suggestion: 'Peça grelhado.' }));

function Probe() {
  const m = useOutsideHome();
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => m.mutate({ message: 'hamburgueria' })}>
        <Text>go</Text>
      </Pressable>
      <Text>{m.data?.suggestion ?? '-'}</Text>
    </>
  );
}

describe('useOutsideHome', () => {
  it('POSTs /me/outside-home and returns the suggestion', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    await render(<Probe />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Peça grelhado.')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/me/outside-home', { method: 'POST', body: { message: 'hamburgueria' } });
  });
});
```

- [ ] **Step 2: Run → fail**, then implement the data layer

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/queries/outside-home.test.tsx` → FAIL.

Create `apps/mobile/lib/queries/outside-home.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import type { CreateOutsideHomeRequest, OutsideHomeSuggestion } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function useOutsideHome() {
  return useMutation({
    mutationFn: (body: CreateOutsideHomeRequest) =>
      apiFetch<OutsideHomeSuggestion>('/me/outside-home', { method: 'POST', body }),
  });
}
```

Run again → PASS.

- [ ] **Step 3: Write the failing screen test**

Create `apps/mobile/app/(app)/fora-de-casa.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockMutate = jest.fn();
let mockState: any = { mutate: mockMutate, isPending: false, isError: false, data: undefined };
jest.mock('../../lib/queries/outside-home', () => ({ useOutsideHome: () => mockState }));

import ForaDeCasa from './fora-de-casa';

beforeEach(() => {
  mockMutate.mockReset();
  mockState = { mutate: mockMutate, isPending: false, isError: false, data: undefined };
});

describe('Fora de casa screen', () => {
  it('submits the message', async () => {
    await render(<ForaDeCasa />);
    await fireEvent.changeText(screen.getByLabelText('Sua situação'), 'Estou num restaurante');
    await fireEvent.press(screen.getByRole('button', { name: /pedir sugestão/i }));
    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({ message: 'Estou num restaurante' }));
  });

  it('shows the suggestion', async () => {
    mockState = { mutate: mockMutate, isPending: false, isError: false, data: { suggestion: 'Peça salada.' } };
    await render(<ForaDeCasa />);
    expect(screen.getByText('Peça salada.')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run → fail**, then implement the screen

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(app\)/fora-de-casa.test.tsx"` → FAIL.

Create `apps/mobile/app/(app)/fora-de-casa.tsx`:

```tsx
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen } from '../../components/ui/screen';
import { TextField } from '../../components/ui/text-field';
import { Button } from '../../components/ui/button';
import { useOutsideHome } from '../../lib/queries/outside-home';

export default function ForaDeCasa() {
  const [message, setMessage] = useState('');
  const outside = useOutsideHome();

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-4">
        <View className="gap-1">
          <Text className="font-heading text-2xl text-foreground">Fora de casa</Text>
          <Text className="font-sans text-base text-muted-foreground">
            Diga onde você está e o que tem por perto — sugerimos algo alinhado ao seu plano.
          </Text>
        </View>

        <TextField
          label="Sua situação"
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder="Ex.: Estou numa hamburgueria com amigos"
        />

        <Button
          label="Pedir sugestão"
          onPress={() => outside.mutate({ message: message.trim() })}
          disabled={message.trim().length === 0}
          loading={outside.isPending}
        />

        {outside.isError ? (
          <Text className="font-sans text-sm text-destructive">
            Não foi possível gerar a sugestão. Tente novamente.
          </Text>
        ) : null}

        {outside.data ? (
          <View className="gap-1 rounded-xl border border-border bg-card p-4">
            <Text className="font-sans-medium text-sm text-primary">Sugestão</Text>
            <Text className="font-sans text-base text-foreground">{outside.data.suggestion}</Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 5: Add the 4th tab**

In `apps/mobile/app/(app)/_layout.tsx`, add between the `planos` and `configuracoes` `Tabs.Screen`:

```tsx
      <Tabs.Screen
        name="fora-de-casa"
        options={{
          title: 'Fora de casa',
          tabBarIcon: ({ color, size }) => <Ionicons name="compass-outline" color={color} size={size} />,
        }}
      />
```

- [ ] **Step 6: Regenerate typed routes, run tests, tsc, full suite**

Run: `pnpm --filter @nutri-plus/mobile exec npx expo customize tsconfig.json` (adds `/fora-de-casa`).
Run: `pnpm --filter @nutri-plus/mobile exec jest lib/queries/outside-home.test.tsx "app/\(app\)/fora-de-casa.test.tsx"` → PASS.
Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (no output) and `pnpm --filter @nutri-plus/mobile test` (all green).

- [ ] **Step 7: Commit**

```bash
git add "apps/mobile/app/(app)/_layout.tsx" "apps/mobile/app/(app)/fora-de-casa.tsx" "apps/mobile/app/(app)/fora-de-casa.test.tsx" apps/mobile/lib/queries/outside-home.ts apps/mobile/lib/queries/outside-home.test.tsx
git commit -m "feat(mobile): 'Fora de casa' tab (outside-home AI assistant)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Manual verification (after all tasks)

Requires a nutritionist + a patient with a plan, on the shared dev DB:
1. Web: on a patient with ≥2 plans, toggle one to "Disponível" and leave others hidden.
2. App (Expo Go, that patient): **Planos** shows only the visible plan(s) — auto-opens if 1, picker if >1; open a plan; tap **Baixar PDF** → the share sheet opens with `plano-alimentar.pdf`.
3. App: **Fora de casa** tab → type "Estou numa padaria" → "Pedir sugestão" → a concise pt-BR suggestion appears (no medical claims).
