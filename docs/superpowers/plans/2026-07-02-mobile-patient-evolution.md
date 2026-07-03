# Mobile patient Evolução (bioimpedance) home + tab shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-in patient lands on an **Evolução** home showing their bioimpedance progress — latest-assessment snapshot with deltas + trend charts — backed by a new `GET /v1/me/assessments`, inside a 3-tab shell (Evolução / Planos / Configurações).

**Architecture:** New patient-facing read-only endpoint (mirrors the `me/meal-plans` pattern) returns `{ name, height, assessments[] }` for the caller. Mobile fetches it via React Query, renders a snapshot + three custom SVG line charts (built on the already-present `react-native-svg` — no native chart module, Expo-Go-safe) + a metrics grid. The `(app)` tab group is restructured to Evolução (home) / Planos (placeholder) / Configurações (placeholder + logout) with `@expo/vector-icons` icons.

**Tech Stack:** NestJS + Prisma (API), `@nutri-plus/shared-types` (tsc-built), Expo SDK 54 + Expo Router (typedRoutes ON), React Query, react-native-svg, jest / jest-expo + @testing-library/react-native.

## Global Constraints

- Branch `feat/mobile-patient-evolution` (already created off `main`; spec committed `5aaba59`). Commit only; do not push/PR unless asked.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **SINGLE quotes** in all new files; pt-BR user-facing copy; **relative imports** (match the current `(app)` screens); reuse `Screen`/`TextField`/`Button` (no new UI primitives).
- **Expo Go must keep working** — no native chart modules; charts are custom `react-native-svg` only. Do NOT reintroduce `node-linker=hoisted`. Never commit `.env` or `.expo/`.
- Assessments are **read-only** in the app (the nutritionist enters them on the web).
- **typedRoutes is ON.** Tasks that rename/add `(app)` routes must regenerate `.expo/types/router.d.ts` **before `tsc`** with `npx expo customize tsconfig.json` (non-destructive — leaves `tsconfig.json` unchanged) or `expo start`. `expo export` does NOT regenerate types in this Expo version. **Never name a test file with a `_layout` prefix** — expo-router's typed-routes generator misparses it as a layout node and drops the whole route group; name layout tests e.g. `app-tabs.test.tsx`. (Metro's `resolver.blockList` already excludes `*.test`/`*.spec` from the bundle.)
- Verify: mobile tasks with `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` **and** `pnpm --filter @nutri-plus/mobile test`; API tasks with `pnpm --filter @nutri-plus/api test`; shared-types with `pnpm --filter @nutri-plus/shared-types build`. Keep the existing suites green (API 187, mobile 33).
- Running a single mobile test whose path has parens: escape them, e.g. `pnpm --filter @nutri-plus/mobile exec jest "app/\(app\)/index.test.tsx"`.

---

### Task 1: shared-types — `MyEvolutionResponse`

**Files:**
- Modify: `packages/shared-types/src/v1/assessment.ts`

**Interfaces:**
- Consumes: existing `BodyAssessment` (same file).
- Produces: `MyEvolutionResponse { name: string; height: number | null; assessments: BodyAssessment[] }`. Auto-exported (`v1/index.ts` already does `export * from './assessment'`; root `src/index.ts` does `export * from './v1'`).

- [ ] **Step 1: Add the interface**

Append to `packages/shared-types/src/v1/assessment.ts`:

```ts
// Response of GET /v1/me/assessments — the caller's own evolution.
export interface MyEvolutionResponse {
  name: string;
  height: number | null;
  assessments: BodyAssessment[];
}
```

- [ ] **Step 2: Build the package (dist is gitignored; the mobile app resolves the built types)**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: tsc build succeeds, exit 0 (regenerates `dist/`).

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/v1/assessment.ts
git commit -m "feat(shared-types): MyEvolutionResponse for GET /me/assessments

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: API — `GET /v1/me/assessments`

**Files:**
- Create: `apps/api/src/patients/patient-assessments.controller.ts`
- Modify: `apps/api/src/patients/patients.service.ts` (add `listMyAssessments`)
- Modify: `apps/api/src/patients/patients.module.ts` (register the controller)
- Test: `apps/api/src/patients/patients.service.spec.ts` (add a `listMyAssessments` describe)

**Interfaces:**
- Consumes: `AuthContext` (`{ authProviderId, email, name, user: { patientProfile: { id, height } | null } }`), `PrismaService.bodyAssessment`.
- Produces: `PatientsService.listMyAssessments(ctx): Promise<{ name: string; height: number | null; assessments: BodyAssessment[] }>`. Controller `GET me/assessments` (`@Roles(PATIENT)`).

- [ ] **Step 1: Write the failing service test**

Add to `apps/api/src/patients/patients.service.spec.ts` (a new `describe` inside the file; reuse the existing `mockDeep` setup — `prisma`, `service`). Add a patient-ctx helper near the other `ctxWith*` helpers:

```ts
function ctxWithPatient(patientProfileId: string | null, height: number | null): AuthContext {
  return {
    authProviderId: 'sub-p',
    email: 'p@x.com',
    name: 'Ana',
    user: {
      id: 'user-p',
      role: 'PATIENT',
      nutritionistProfile: null,
      employeeProfile: null,
      patientProfile: patientProfileId ? { id: patientProfileId, height } : null,
    } as any,
  };
}
```

```ts
describe('listMyAssessments', () => {
  it("returns the caller's assessments ordered by date, with name and height", async () => {
    const rows = [
      { id: 'a1', patientId: 'pp-1', assessmentDate: new Date('2026-01-01'), weight: 80 },
      { id: 'a2', patientId: 'pp-1', assessmentDate: new Date('2026-02-01'), weight: 79 },
    ];
    prisma.bodyAssessment.findMany.mockResolvedValue(rows as any);

    const result = await service.listMyAssessments(ctxWithPatient('pp-1', 170));

    expect(prisma.bodyAssessment.findMany).toHaveBeenCalledWith({
      where: { patientId: 'pp-1' },
      orderBy: { assessmentDate: 'asc' },
    });
    expect(result).toEqual({ name: 'Ana', height: 170, assessments: rows });
  });

  it('returns an empty list when the patient has no assessments', async () => {
    prisma.bodyAssessment.findMany.mockResolvedValue([] as any);
    const result = await service.listMyAssessments(ctxWithPatient('pp-2', null));
    expect(result).toEqual({ name: 'Ana', height: null, assessments: [] });
  });

  it('rejects a caller without a patient profile', async () => {
    await expect(service.listMyAssessments(ctxWithPatient(null, null))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
```

`ForbiddenException` is already imported at the top of the spec — confirm it is; if not, add it to the `@nestjs/common` import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/api exec jest patients.service.spec`
Expected: FAIL — `service.listMyAssessments` is not a function.

- [ ] **Step 3: Add the service method**

In `apps/api/src/patients/patients.service.ts`: ensure `ForbiddenException` is imported from `@nestjs/common` (add it to the existing import), then add:

```ts
  // Patient-facing: the caller reads their OWN body assessments (evolution).
  // Ownership comes from the caller's own patientProfile, like the meal-plan
  // patient surface. Read-only — a nutritionist enters assessments on the web.
  async listMyAssessments(ctx: AuthContext) {
    const profile = ctx.user?.patientProfile;
    if (!profile) {
      throw new ForbiddenException('Patient profile required');
    }
    const assessments = await this.prisma.bodyAssessment.findMany({
      where: { patientId: profile.id },
      orderBy: { assessmentDate: 'asc' },
    });
    return { name: ctx.name, height: profile.height ?? null, assessments };
  }
```

- [ ] **Step 4: Create the controller**

Create `apps/api/src/patients/patient-assessments.controller.ts` (mirrors `apps/api/src/meal-plans/patient-meal-plans.controller.ts`):

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { PatientsService } from './patients.service';

@ApiTags('assessments')
@ApiBearerAuth()
@Controller({ path: 'me/assessments', version: '1' })
@Roles(UserRole.PATIENT)
export class PatientAssessmentsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  list(@CurrentUser() ctx: AuthContext) {
    return this.patients.listMyAssessments(ctx);
  }
}
```

- [ ] **Step 5: Register the controller in the module**

Edit `apps/api/src/patients/patients.module.ts` — import `PatientAssessmentsController` and add it to `controllers`:

```ts
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SupabaseAdminModule } from '../supabase/supabase-admin.module';
import { PatientsController } from './patients.controller';
import { PatientAssessmentsController } from './patient-assessments.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [UsersModule, SupabaseAdminModule],
  controllers: [PatientsController, PatientAssessmentsController],
  providers: [PatientsService],
})
export class PatientsModule {}
```

- [ ] **Step 6: Run the tests to verify they pass + full API suite**

Run: `pnpm --filter @nutri-plus/api exec jest patients.service.spec` → PASS (the 3 new cases).
Run: `pnpm --filter @nutri-plus/api test` → all suites green (187 prior + the new cases; `app.module.spec` still boots with the new controller registered).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/patients/patient-assessments.controller.ts apps/api/src/patients/patients.service.ts apps/api/src/patients/patients.module.ts apps/api/src/patients/patients.service.spec.ts
git commit -m "feat(api): GET /v1/me/assessments for the logged-in patient

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Mobile data layer — `getMyEvolution` + `useMyEvolution`

**Files:**
- Create: `apps/mobile/lib/queries/assessments.ts`
- Test: `apps/mobile/lib/queries/assessments.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` from `../api` (`apps/mobile/lib/api.ts`); `MyEvolutionResponse` from `@nutri-plus/shared-types` (Task 1, rebuilt).
- Produces: `getMyEvolution(): Promise<MyEvolutionResponse>` and `useMyEvolution()` (React Query, key `['me', 'assessments']`).

> Note: mobile keeps the single `lib/api.ts` client (there is no `lib/api/` directory). The evolution fetch fn + hook co-locate in `lib/queries/assessments.ts`, importing `apiFetch` from `../api` — this avoids a `lib/api.ts`-vs-`lib/api/` name collision.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/lib/queries/assessments.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockApiFetch = jest.fn();
jest.mock('../api', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

import { getMyEvolution, useMyEvolution } from './assessments';

const envelope = { name: 'Ana', height: 170, assessments: [] };

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue(envelope);
});

describe('getMyEvolution', () => {
  it('GETs /me/assessments and returns the envelope', async () => {
    const result = await getMyEvolution();
    expect(mockApiFetch).toHaveBeenCalledWith('/me/assessments');
    expect(result).toEqual(envelope);
  });
});

describe('useMyEvolution', () => {
  it('loads the evolution via the [me, assessments] key', async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMyEvolution(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe('Ana');
    expect(mockApiFetch).toHaveBeenCalledWith('/me/assessments');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/queries/assessments.test.tsx`
Expected: FAIL — `./assessments` cannot be resolved.

- [ ] **Step 3: Create the data layer**

Create `apps/mobile/lib/queries/assessments.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { MyEvolutionResponse } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function getMyEvolution(): Promise<MyEvolutionResponse> {
  return apiFetch<MyEvolutionResponse>('/me/assessments');
}

export function useMyEvolution() {
  return useQuery({ queryKey: ['me', 'assessments'], queryFn: getMyEvolution });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/queries/assessments.test.tsx`
Expected: PASS (both describes). If `renderHook` is unavailable in this RNTL version, fall back to rendering a tiny probe component that calls `useMyEvolution()` and asserts the resolved `data` — but RNTL 14 exports `renderHook`, so this should pass as written.

- [ ] **Step 5: Typecheck + full suite, then commit**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (expects the Task-1 rebuilt type to resolve) and `pnpm --filter @nutri-plus/mobile test`.

```bash
git add apps/mobile/lib/queries/assessments.ts apps/mobile/lib/queries/assessments.test.tsx
git commit -m "feat(mobile): useMyEvolution data layer for /me/assessments

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Mobile — `LineChart` SVG component

**Files:**
- Create: `apps/mobile/components/chart/line-chart.tsx`
- Test: `apps/mobile/components/chart/line-chart.test.tsx`

**Interfaces:**
- Consumes: `react-native-svg` (already a dependency).
- Produces: `LineChart({ data, height?, color? }: { data: { x: number; y: number }[]; height?: number; color?: string })`. Renders responsively (`width="100%"`, internal `viewBox`). Test IDs: the polyline path is `testID="line-chart-path"`; the last-point marker is `testID="line-chart-dot"`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/components/chart/line-chart.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { LineChart } from './line-chart';

describe('LineChart', () => {
  it('renders a path and an end dot for 2+ points', async () => {
    await render(<LineChart data={[{ x: 0, y: 10 }, { x: 1, y: 20 }, { x: 2, y: 15 }]} />);
    expect(screen.getByTestId('line-chart-path')).toBeTruthy();
    expect(screen.getByTestId('line-chart-dot')).toBeTruthy();
  });

  it('renders a single dot and no path for 1 point', async () => {
    await render(<LineChart data={[{ x: 0, y: 10 }]} />);
    expect(screen.queryByTestId('line-chart-path')).toBeNull();
    expect(screen.getByTestId('line-chart-dot')).toBeTruthy();
  });

  it('renders neither path nor dot for 0 points', async () => {
    await render(<LineChart data={[]} />);
    expect(screen.queryByTestId('line-chart-path')).toBeNull();
    expect(screen.queryByTestId('line-chart-dot')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest components/chart/line-chart.test.tsx`
Expected: FAIL — `./line-chart` cannot be resolved.

- [ ] **Step 3: Implement the component**

Create `apps/mobile/components/chart/line-chart.tsx`:

```tsx
import Svg, { Circle, Line, Path } from 'react-native-svg';

type Point = { x: number; y: number };
type LineChartProps = { data: Point[]; height?: number; color?: string };

// Internal coordinate space; the Svg scales to the container via viewBox.
const VIEW_W = 300;
const VIEW_H = 120;
const PAD_X = 8;
const PAD_Y = 12;

export function LineChart({ data, height = 120, color = '#14bfa6' }: LineChartProps) {
  if (data.length === 0) return null;

  const xs = data.map((p) => p.x);
  const ys = data.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) {
    // Flat series: pad so the line/dot sits mid-height instead of dividing by 0.
    yMin -= 1;
    yMax += 1;
  }

  const px = (x: number) =>
    xMax === xMin ? VIEW_W / 2 : PAD_X + ((x - xMin) / (xMax - xMin)) * (VIEW_W - 2 * PAD_X);
  const py = (y: number) => VIEW_H - PAD_Y - ((y - yMin) / (yMax - yMin)) * (VIEW_H - 2 * PAD_Y);

  const points = data.map((p) => ({ cx: px(p.x), cy: py(p.y) }));
  const last = points[points.length - 1];

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
      {[PAD_Y, VIEW_H / 2, VIEW_H - PAD_Y].map((gy, i) => (
        <Line key={i} x1={PAD_X} y1={gy} x2={VIEW_W - PAD_X} y2={gy} stroke="#243029" strokeWidth={1} />
      ))}
      {points.length >= 2 ? (
        <Path
          testID="line-chart-path"
          d={points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx} ${p.cy}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      <Circle testID="line-chart-dot" cx={last.cx} cy={last.cy} r={4} fill={color} />
    </Svg>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @nutri-plus/mobile exec jest components/chart/line-chart.test.tsx`
Expected: PASS (all three cases — path present only for ≥2 points; dot always when ≥1; nothing for 0).

- [ ] **Step 5: Typecheck + full suite, then commit**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` and `pnpm --filter @nutri-plus/mobile test`.

```bash
git add apps/mobile/components/chart/line-chart.tsx apps/mobile/components/chart/line-chart.test.tsx
git commit -m "feat(mobile): minimal SVG LineChart component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Mobile — 3-tab shell (Evolução / Planos / Configurações)

**Files:**
- Modify: `apps/mobile/package.json` (+ lockfile) — add `@expo/vector-icons`
- Modify: `apps/mobile/app/(app)/_layout.tsx`
- Rename: `apps/mobile/app/(app)/perfil.tsx` → `apps/mobile/app/(app)/configuracoes.tsx`
- Test: `apps/mobile/app/(app)/app-tabs.test.tsx` (layout guard; **not** `_layout`-prefixed), `apps/mobile/app/(app)/configuracoes.test.tsx`

**Interfaces:**
- Consumes: `useSession` from `../../lib/auth`; `Redirect`, `Tabs` from `expo-router`; `Ionicons` from `@expo/vector-icons`; `Button`.
- Produces: the authenticated `Tabs` with screens `index` (Evolução), `planos` (Planos), `configuracoes` (Config); `Configuracoes` screen (email + Sair).

- [ ] **Step 1: Add `@expo/vector-icons` as a direct dependency**

It is currently only a nested transitive dep (pnpm strict), so declare it directly (Expo picks the SDK-54-compatible version):

Run: `pnpm --filter @nutri-plus/mobile exec npx expo install @expo/vector-icons`
Expected: adds `@expo/vector-icons` to `apps/mobile/package.json` dependencies; `node -e "require.resolve('@expo/vector-icons')"` (from `apps/mobile`) then resolves.

- [ ] **Step 2: Rename the settings screen (preserve its content)**

Run: `git mv "apps/mobile/app/(app)/perfil.tsx" "apps/mobile/app/(app)/configuracoes.tsx"`

Then set `apps/mobile/app/(app)/configuracoes.tsx` to (rename the component, keep email + Sair):

```tsx
import { Text, View } from 'react-native';
import { useSession } from '../../lib/auth';
import { Button } from '../../components/ui/button';

export default function Configuracoes() {
  const { session, signOut } = useSession();
  return (
    <View className="flex-1 justify-between bg-background p-6">
      <View className="gap-1">
        <Text className="font-heading text-2xl text-foreground">Configurações</Text>
        <Text className="font-sans text-base text-muted-foreground">{session?.user.email ?? ''}</Text>
      </View>
      <Button label="Sair" onPress={signOut} />
    </View>
  );
}
```

- [ ] **Step 3: Write the failing tests**

Create `apps/mobile/app/(app)/configuracoes.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockSignOut = jest.fn();
jest.mock('../../lib/auth', () => ({
  useSession: () => ({ session: { user: { email: 'ana@x.com' } }, signOut: mockSignOut }),
}));

import Configuracoes from './configuracoes';

beforeEach(() => mockSignOut.mockReset());

describe('Configuracoes screen', () => {
  it('shows the email and signs out on Sair', async () => {
    await render(<Configuracoes />);
    expect(screen.getByText('ana@x.com')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /sair/i }));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
```

Create `apps/mobile/app/(app)/app-tabs.test.tsx` (layout session guard — mock `expo-router` + `useSession`; **filename must not start with `_layout`**):

```tsx
import { render } from '@testing-library/react-native';

const mockRedirect = jest.fn();
let mockSessionState: { session: unknown; loading: boolean } = { session: null, loading: false };

jest.mock('expo-router', () => {
  const Tabs: any = ({ children }: { children: unknown }) => children;
  Tabs.Screen = () => null;
  return {
    Tabs,
    Redirect: ({ href }: { href: string }) => {
      mockRedirect(href);
      return null;
    },
  };
});
jest.mock('../../lib/auth', () => ({ useSession: () => mockSessionState }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import AppLayout from './_layout';

beforeEach(() => {
  mockRedirect.mockReset();
  mockSessionState = { session: null, loading: false };
});

describe('(app) tab layout guard', () => {
  it('redirects to login when there is no session', async () => {
    await render(<AppLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(auth)/login');
  });

  it('renders the tabs (no redirect) when a session exists', async () => {
    mockSessionState = { session: { user: {} }, loading: false };
    await render(<AppLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(app\)/configuracoes.test.tsx" "app/\(app\)/app-tabs.test.tsx"`
Expected: FAIL — `configuracoes` default export not found yet / layout still references `perfil` (and Ionicons import may not resolve until Step 1 done). The `app-tabs` guard test should pass on the guard once the layout compiles; the `configuracoes` test drives the rename.

- [ ] **Step 5: Update the tab layout**

Set `apps/mobile/app/(app)/_layout.tsx` to:

```tsx
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../../lib/auth';

export default function AppLayout() {
  const { session, loading } = useSession();
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#14bfa6',
        tabBarInactiveTintColor: '#8a9a92',
        tabBarStyle: { backgroundColor: '#141d19', borderTopColor: '#243029' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Evolução',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="planos"
        options={{
          title: 'Planos',
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="configuracoes"
        options={{
          title: 'Config',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 6: Regenerate typed routes (perfil→configuracoes changed the route set), then run tests**

Run (regenerates `.expo/types/router.d.ts` so `Tabs.Screen name="configuracoes"` typechecks): `pnpm --filter @nutri-plus/mobile exec npx expo customize tsconfig.json`
Expected: exits 0, leaves `tsconfig.json` unchanged; `.expo/types/router.d.ts` now lists `/configuracoes` (and no `/perfil`).

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(app\)/configuracoes.test.tsx" "app/\(app\)/app-tabs.test.tsx"` → PASS.

- [ ] **Step 7: Typecheck + full suite, then commit**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (expects no output — the route types now include `configuracoes`) and `pnpm --filter @nutri-plus/mobile test`.

```bash
git add apps/mobile/package.json pnpm-lock.yaml "apps/mobile/app/(app)/_layout.tsx" "apps/mobile/app/(app)/configuracoes.tsx" "apps/mobile/app/(app)/app-tabs.test.tsx" "apps/mobile/app/(app)/configuracoes.test.tsx"
git commit -m "feat(mobile): 3-tab shell (Evolução/Planos/Configurações) with icons

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Note: `git mv perfil.tsx configuracoes.tsx` is captured by staging the new path + the deletion of the old (add `-A` on the `(app)` dir if the removal isn't staged: `git add -A "apps/mobile/app/(app)"`).

---

### Task 6: Mobile — Evolução screen (`app/(app)/index.tsx`)

**Files:**
- Modify: `apps/mobile/app/(app)/index.tsx` (replace the placeholder)
- Test: `apps/mobile/app/(app)/index.test.tsx`

**Interfaces:**
- Consumes: `useMyEvolution` (Task 3), `LineChart` (Task 4), `Screen`, `Button`; `MyEvolutionResponse`/`BodyAssessment` types.
- Produces: the default-export `Home` (Evolução) route.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/(app)/index.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockUseMyEvolution = jest.fn();
jest.mock('../../lib/queries/assessments', () => ({ useMyEvolution: () => mockUseMyEvolution() }));

import Home from './index';

const two = {
  name: 'Ana',
  height: 170,
  assessments: [
    { id: 'a1', patientId: 'p', assessmentDate: '2026-01-10', weight: 80, bodyFatPercentage: 30, muscleMass: 30, leanMass: null, visceralFat: 10, basalMetabolicRate: 1500, bodyWaterPercentage: 50, boneMass: 3, metabolicAge: 40, waistCircumference: 90, hipCircumference: null, chestCircumference: null, armCircumference: null, thighCircumference: null, notes: null, createdAt: '2026-01-10' },
    { id: 'a2', patientId: 'p', assessmentDate: '2026-02-10', weight: 78, bodyFatPercentage: 28, muscleMass: 31, leanMass: null, visceralFat: 9, basalMetabolicRate: 1520, bodyWaterPercentage: 51, boneMass: 3, metabolicAge: 39, waistCircumference: 88, hipCircumference: null, chestCircumference: null, armCircumference: null, thighCircumference: null, notes: null, createdAt: '2026-02-10' },
  ],
};

beforeEach(() => mockUseMyEvolution.mockReset());

describe('Evolução screen', () => {
  it('shows a loading state', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: true });
    await render(<Home />);
    expect(screen.getByTestId('evolution-loading')).toBeTruthy();
  });

  it('shows the empty state when there are no assessments', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: { name: 'Ana', height: 170, assessments: [] } });
    await render(<Home />);
    expect(screen.getByText('Suas avaliações aparecerão aqui após sua consulta.')).toBeTruthy();
  });

  it('shows an error state with retry', async () => {
    const refetch = jest.fn();
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: true, refetch });
    await render(<Home />);
    await fireEvent.press(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders the greeting, latest snapshot and trend charts from data', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: two });
    await render(<Home />);
    expect(screen.getByText('Olá, Ana')).toBeTruthy();
    expect(screen.getByText('Peso')).toBeTruthy();
    expect(screen.getByText('IMC')).toBeTruthy();
    // latest weight 78 kg is shown (regex: the tile composes '78,0' + ' kg' in one Text)
    expect(screen.getByText(/78,0/)).toBeTruthy();
    // three trend charts → at least one chart path renders (2 points each)
    expect(screen.getAllByTestId('line-chart-path').length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(app\)/index.test.tsx"`
Expected: FAIL — the placeholder `Home` shows none of these (no `evolution-loading`, no snapshot).

- [ ] **Step 3: Implement the screen**

Replace `apps/mobile/app/(app)/index.tsx` with:

```tsx
import { ActivityIndicator, Text, View } from 'react-native';
import type { BodyAssessment } from '@nutri-plus/shared-types';
import { Screen } from '../../components/ui/screen';
import { Button } from '../../components/ui/button';
import { LineChart } from '../../components/chart/line-chart';
import { useMyEvolution } from '../../lib/queries/assessments';

// pt-BR number with 1 decimal and comma; '—' for null/undefined.
function fmt(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(digits).replace('.', ',');
}

function bmi(weight: number | null, height: number | null): number | null {
  if (weight === null || height === null || height <= 0) return null;
  return weight / (height / 100) ** 2;
}

// ISO 'YYYY-MM-DD...' → 'DD/MM/YYYY' (tz-safe: no Date parsing).
function formatDate(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

type Metric = keyof Pick<BodyAssessment, 'weight' | 'bodyFatPercentage' | 'muscleMass'>;

function Tile({ label, value, unit, delta }: { label: string; value: string; unit?: string; delta: number | null }) {
  return (
    <View className="min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-card p-3">
      <Text className="font-sans text-sm text-muted-foreground">{label}</Text>
      <Text className="font-heading text-xl text-foreground">
        {value}
        {unit ? <Text className="font-sans text-sm text-muted-foreground"> {unit}</Text> : null}
      </Text>
      {delta !== null ? (
        <Text className="font-sans text-xs text-primary">
          {delta >= 0 ? '▲' : '▼'} {fmt(Math.abs(delta))}
        </Text>
      ) : null}
    </View>
  );
}

function Trend({ label, points }: { label: string; points: { x: number; y: number }[] }) {
  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-3">
      <Text className="font-sans text-sm text-muted-foreground">{label}</Text>
      {points.length >= 2 ? (
        <LineChart data={points} />
      ) : (
        <Text className="font-sans text-xs text-muted-foreground">Sem histórico suficiente para tendência ainda.</Text>
      )}
    </View>
  );
}

function GridRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between border-b border-border py-2">
      <Text className="font-sans text-sm text-muted-foreground">{label}</Text>
      <Text className="font-sans text-sm text-foreground">{value}</Text>
    </View>
  );
}

export default function Home() {
  const query = useMyEvolution();

  if (query.isLoading) {
    return (
      <View testID="evolution-loading" className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#14bfa6" />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="font-sans text-center text-base text-muted-foreground">
          Não foi possível carregar sua evolução.
        </Text>
        <Button label="Tentar de novo" onPress={() => query.refetch()} />
      </View>
    );
  }

  const { name, height, assessments } = query.data!;

  if (assessments.length === 0) {
    return (
      <Screen contentContainerClassName="grow justify-center p-6">
        <View className="items-center gap-2">
          <Text className="font-heading text-2xl text-foreground">Olá, {name}</Text>
          <Text className="font-sans text-center text-base text-muted-foreground">
            Suas avaliações aparecerão aqui após sua consulta.
          </Text>
        </View>
      </Screen>
    );
  }

  const latest = assessments[assessments.length - 1];
  const previous = assessments.length >= 2 ? assessments[assessments.length - 2] : null;

  const deltaOf = (key: keyof BodyAssessment): number | null => {
    const cur = latest[key];
    const prev = previous ? previous[key] : null;
    return typeof cur === 'number' && typeof prev === 'number' ? cur - prev : null;
  };

  const curBmi = bmi(latest.weight, height);
  const prevBmi = previous ? bmi(previous.weight, height) : null;
  const bmiDelta = curBmi !== null && prevBmi !== null ? curBmi - prevBmi : null;

  const trend = (key: Metric) =>
    assessments
      .filter((a) => a[key] !== null)
      .map((a, i) => ({ x: i, y: a[key] as number }));

  const grid: { label: string; value: string }[] = [
    { label: 'Gordura visceral', value: fmt(latest.visceralFat, 0) },
    { label: 'Taxa metabólica basal', value: fmt(latest.basalMetabolicRate, 0) },
    { label: 'Água corporal (%)', value: fmt(latest.bodyWaterPercentage) },
    { label: 'Massa óssea (kg)', value: fmt(latest.boneMass) },
    { label: 'Idade metabólica', value: fmt(latest.metabolicAge, 0) },
    { label: 'Cintura (cm)', value: fmt(latest.waistCircumference) },
    { label: 'Quadril (cm)', value: fmt(latest.hipCircumference) },
    { label: 'Tórax (cm)', value: fmt(latest.chestCircumference) },
    { label: 'Braço (cm)', value: fmt(latest.armCircumference) },
    { label: 'Coxa (cm)', value: fmt(latest.thighCircumference) },
  ];

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-6">
        <View className="gap-1">
          <Text className="font-heading text-2xl text-foreground">Olá, {name}</Text>
          <Text className="font-sans text-base text-muted-foreground">Sua evolução</Text>
        </View>

        <View className="gap-2">
          <Text className="font-sans text-sm text-muted-foreground">
            Última avaliação · {formatDate(latest.assessmentDate)}
          </Text>
          <View className="flex-row flex-wrap gap-3">
            <Tile label="Peso" value={fmt(latest.weight)} unit="kg" delta={deltaOf('weight')} />
            <Tile label="% Gordura" value={fmt(latest.bodyFatPercentage)} unit="%" delta={deltaOf('bodyFatPercentage')} />
            <Tile label="Massa muscular" value={fmt(latest.muscleMass)} unit="kg" delta={deltaOf('muscleMass')} />
            <Tile label="IMC" value={fmt(curBmi)} delta={bmiDelta} />
          </View>
        </View>

        <View className="gap-3">
          <Text className="font-heading text-lg text-foreground">Tendências</Text>
          <Trend label="Peso (kg)" points={trend('weight')} />
          <Trend label="% Gordura" points={trend('bodyFatPercentage')} />
          <Trend label="Massa muscular (kg)" points={trend('muscleMass')} />
        </View>

        <View className="gap-1">
          <Text className="font-heading text-lg text-foreground">Detalhes da última avaliação</Text>
          {grid.map((row) => (
            <GridRow key={row.label} label={row.label} value={row.value} />
          ))}
        </View>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(app\)/index.test.tsx"`
Expected: PASS (loading, empty, error+retry, and the data case rendering greeting/tiles/`IMC`/`78,0`/≥3 chart paths).

- [ ] **Step 5: Typecheck + full suite + bundle sanity, then commit**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (no output) and `pnpm --filter @nutri-plus/mobile test` (whole mobile suite green).
Then confirm the app still bundles on device (Expo Go): `(cd apps/mobile && rm -rf /tmp/evo-export && npx expo export -p ios --output-dir /tmp/evo-export)` → expect `Exported: …` (exit 0). (This validates the whole logged-in flow bundles with the new SVG charts + `@expo/vector-icons`; it does not regenerate types.)

```bash
git add "apps/mobile/app/(app)/index.tsx" "apps/mobile/app/(app)/index.test.tsx"
git commit -m "feat(mobile): patient Evolução (bioimpedance) home screen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Manual verification (after all tasks)

Not part of the automated suite; requires a patient account that has ≥1 body assessment entered on the web:
1. `pnpm mobile` (or `pnpm --filter @nutri-plus/mobile start`), open in Expo Go (SDK 54), log in as that patient.
2. Land on **Evolução**: greeting, latest snapshot with deltas, three trend charts, metrics grid.
3. A patient with no assessments sees the empty state; the bottom tabs switch between Evolução / Planos (placeholder) / Configurações (email + Sair).
