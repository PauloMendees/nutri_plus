# Patient Settings Tab (Configurações) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the mobile Configurações tab so a patient can change their password, switch theme (light/dark/system), view their nutritionist's basic data, log out (exists), and permanently delete their account.

**Architecture:** Mostly mobile (Expo). Theme becomes scheme-reactive by moving the flat semantic color tokens to CSS variables (per-scheme `vars()` blocks) + a persisted `ThemeProvider`. The API gains one patient-scoped controller (`MeController`) with `GET /me/nutritionist` and `DELETE /me` (an ordered hard-delete of all patient rows + the Supabase auth user). One `shared-types` interface (`NutritionistContact`) is the API↔mobile contract. No database migration.

**Tech Stack:** Expo SDK 54 / Expo Router (typedRoutes ON) / NativeWind v4 + gluestack-ui v2 / React Query / react-hook-form + zod / NestJS + Prisma 7 / Supabase (auth + admin).

## Global Constraints

- SINGLE quotes in new files; pt-BR user copy.
- Relative imports in mobile matching existing screens; reuse `Screen` / `TextField` / `Button` — no new mobile UI primitives.
- Expo Go must keep working: only Expo-SDK modules (`expo-secure-store`, `@expo/vector-icons` already deps) — no dev-build-only native modules.
- Do NOT reintroduce `node-linker=hoisted`; never commit `.env` or `.expo/`.
- The Supabase anon key stays client-only; no migrations in this feature.
- `typedRoutes` regen (`expo customize tsconfig.json`) before mobile `tsc` on any task that adds routes; never name a test file `_layout*`.
- Mobile query/mutation-hook tests use a `Probe` component rendered with a `QueryClient` configured `{ queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } }` — never `renderHook`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do not push/PR unless asked.
- Verify: API `pnpm --filter @nutri-plus/api test`; shared-types `pnpm --filter @nutri-plus/shared-types build`; mobile `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` AND `pnpm --filter @nutri-plus/mobile test`. Keep existing suites green (baselines ≈ API 195, mobile 55).

---

## File Structure

**Mobile**
- `apps/mobile/components/ui/gluestack-ui-provider/config.ts` — MODIFY: export `SEMANTIC_LIGHT`/`SEMANTIC_DARK` token maps; spread into the `light`/`dark` `vars()` blocks. (Task 1)
- `apps/mobile/tailwind.config.js` — MODIFY: flat semantic colors reference `rgb(var(--token)/<alpha-value>)`. (Task 1)
- `apps/mobile/lib/theme.tsx` — CREATE: `ThemeProvider`, `useTheme`, `getTabBarColors`. (Task 2)
- `apps/mobile/app/_layout.tsx` — MODIFY: wrap in `ThemeProvider`; `GluestackUIProvider mode` from `useTheme`. (Task 3)
- `apps/mobile/app/(app)/_layout.tsx` — MODIFY: scheme-aware tab bar via `getTabBarColors` + `useColorScheme`. (Task 3)
- `apps/mobile/lib/queries/nutritionist.ts` — CREATE: `useMyNutritionist`. (Task 7)
- `apps/mobile/lib/validation/auth.ts` — MODIFY: `changePasswordSchema`. (Task 8)
- `apps/mobile/app/(app)/configuracoes/_layout.tsx` — CREATE: `Stack`. (Task 9)
- `apps/mobile/app/(app)/configuracoes/index.tsx` — from the moved flat file; rewritten to the settings list. (Task 9 move, Task 10 rewrite)
- `apps/mobile/app/(app)/configuracoes/senha.tsx` — CREATE: change-password form. (Task 9)
- `apps/mobile/app/(app)/configuracoes.tsx` — REMOVED (git mv → `configuracoes/index.tsx`). (Task 9)

**API**
- `apps/api/src/patients/me.controller.ts` — CREATE: `MeController` (`GET nutritionist`, `DELETE`). (Tasks 5, 6)
- `apps/api/src/patients/patients.service.ts` — MODIFY: `getMyNutritionist` (Task 5), `deleteMyAccount` (Task 6).
- `apps/api/src/patients/patients.module.ts` — MODIFY: register `MeController`. (Task 5)
- `apps/api/src/patients/patients.service.spec.ts` — MODIFY: new describe blocks. (Tasks 5, 6)

**Shared types**
- `packages/shared-types/src/v1/nutritionist-contact.ts` — CREATE. (Task 4)
- `packages/shared-types/src/v1/index.ts` — MODIFY: `export * from './nutritionist-contact'`. (Task 4)

Build order: theme (1–3), then the nutritionist contract + API (4–6), then mobile data/validation (7–8), then screens (9–10).

---

## Task 1: Scheme-reactive theme tokens

Move the flat semantic palette (`background`, `foreground`, `primary`, …) from hardcoded dark hex to per-scheme CSS variables. Dark values are unchanged (no visual change in dark); a light palette is added.

**Files:**
- Modify: `apps/mobile/components/ui/gluestack-ui-provider/config.ts`
- Modify: `apps/mobile/tailwind.config.js:26-36`
- Test: `apps/mobile/components/ui/gluestack-ui-provider/config.test.ts`

**Interfaces:**
- Produces: `SEMANTIC_LIGHT`, `SEMANTIC_DARK` (`Record<string, string>` of `--token` → space-separated RGB triplet), exported from `config.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/components/ui/gluestack-ui-provider/config.test.ts`:

```ts
import { SEMANTIC_LIGHT, SEMANTIC_DARK } from './config';

describe('semantic theme tokens', () => {
  it('defines the same token keys in light and dark', () => {
    expect(Object.keys(SEMANTIC_LIGHT).sort()).toEqual(Object.keys(SEMANTIC_DARK).sort());
  });

  it('keeps the current dark values', () => {
    expect(SEMANTIC_DARK['--background']).toBe('13 20 17');
    expect(SEMANTIC_DARK['--foreground']).toBe('231 236 233');
    expect(SEMANTIC_DARK['--primary']).toBe('20 191 166');
    expect(SEMANTIC_DARK['--destructive']).toBe('229 72 77');
  });

  it('defines a light palette distinct from dark', () => {
    expect(SEMANTIC_LIGHT['--background']).toBe('246 250 248');
    expect(SEMANTIC_LIGHT['--foreground']).toBe('13 20 17');
    expect(SEMANTIC_LIGHT['--primary']).toBe('15 158 136');
    expect(SEMANTIC_LIGHT['--background']).not.toBe(SEMANTIC_DARK['--background']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest components/ui/gluestack-ui-provider/config.test.ts`
Expected: FAIL — `SEMANTIC_LIGHT`/`SEMANTIC_DARK` are not exported.

- [ ] **Step 3: Add the token maps and spread them into the vars() blocks**

In `apps/mobile/components/ui/gluestack-ui-provider/config.ts`, insert these two exports **above** `export const config = {`:

```ts
// nutri-plus semantic tokens — the flat palette consumed by className styling
// (bg-background, text-primary, etc.). Defined per scheme so the app recolors
// when the color scheme flips. Values are space-separated RGB triplets.
export const SEMANTIC_DARK: Record<string, string> = {
  '--background': '13 20 17',
  '--foreground': '231 236 233',
  '--card': '20 29 25',
  '--border': '36 48 41',
  '--input': '44 58 51',
  '--primary': '20 191 166',
  '--primary-foreground': '4 36 27',
  '--secondary': '26 37 32',
  '--secondary-foreground': '167 216 201',
  '--muted': '22 31 27',
  '--muted-foreground': '138 154 146',
  '--accent': '26 37 32',
  '--accent-foreground': '167 216 201',
  '--destructive': '229 72 77',
  '--destructive-foreground': '255 255 255',
};

export const SEMANTIC_LIGHT: Record<string, string> = {
  '--background': '246 250 248',
  '--foreground': '13 20 17',
  '--card': '255 255 255',
  '--border': '219 229 224',
  '--input': '238 243 240',
  '--primary': '15 158 136',
  '--primary-foreground': '255 255 255',
  '--secondary': '230 244 239',
  '--secondary-foreground': '15 95 78',
  '--muted': '238 243 240',
  '--muted-foreground': '92 107 100',
  '--accent': '230 244 239',
  '--accent-foreground': '15 95 78',
  '--destructive': '220 38 38',
  '--destructive-foreground': '255 255 255',
};
```

Then spread each map into the matching `vars({...})` block. In the `light: vars({` block, add as the **last** entry (just before the block's closing `}),`):

```ts
    /* Focus Ring Indicator  */
    '--color-indicator-primary': '55 55 55',
    '--color-indicator-info': '83 153 236',
    '--color-indicator-error': '185 28 28',
    ...SEMANTIC_LIGHT,
  }),
```

In the `dark: vars({` block, add as the last entry before its closing `}),`:

```ts
    /* Focus Ring Indicator  */
    '--color-indicator-primary': '247 247 247',
    '--color-indicator-info': '161 199 245',
    '--color-indicator-error': '232 70 69',
    ...SEMANTIC_DARK,
  }),
```

- [ ] **Step 4: Point the Tailwind semantic colors at the CSS vars**

In `apps/mobile/tailwind.config.js`, replace the flat block (lines ≈ 27–36, the `background`…`destructive` keys — leave the gluestack numeric scales below them untouched):

```js
        background: 'rgb(var(--background)/<alpha-value>)',
        foreground: 'rgb(var(--foreground)/<alpha-value>)',
        card: 'rgb(var(--card)/<alpha-value>)',
        border: 'rgb(var(--border)/<alpha-value>)',
        input: 'rgb(var(--input)/<alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary)/<alpha-value>)',
          foreground: 'rgb(var(--primary-foreground)/<alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary)/<alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground)/<alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted)/<alpha-value>)',
          foreground: 'rgb(var(--muted-foreground)/<alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent)/<alpha-value>)',
          foreground: 'rgb(var(--accent-foreground)/<alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive)/<alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground)/<alpha-value>)',
        },
```

- [ ] **Step 5: Run the test + type check + full mobile suite**

Run: `pnpm --filter @nutri-plus/mobile exec jest components/ui/gluestack-ui-provider/config.test.ts`
Expected: PASS.

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter @nutri-plus/mobile test`
Expected: existing suite stays green (dark mode is byte-for-byte the same palette). This is the guard that the token rename didn't break any screen.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/ui/gluestack-ui-provider/config.ts apps/mobile/components/ui/gluestack-ui-provider/config.test.ts apps/mobile/tailwind.config.js
git commit -m "feat(mobile): scheme-reactive semantic color tokens + light palette

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: ThemeProvider, useTheme, and tab-bar colors

A persisted theme preference (`light`/`dark`/`system`) stored in `SecureStore`, plus a pure `getTabBarColors` helper the tab bar uses (the tab bar sets native colors, not className styles, so it can't read the CSS vars).

**Files:**
- Create: `apps/mobile/lib/theme.tsx`
- Test: `apps/mobile/lib/theme.test.tsx`

**Interfaces:**
- Consumes: `ModeType` (`'light' | 'dark' | 'system'`) from `../components/ui/gluestack-ui-provider`.
- Produces:
  - `ThemeProvider({ children })`
  - `useTheme(): { mode: ModeType; setMode: (mode: ModeType) => void }`
  - `getTabBarColors(scheme: 'light' | 'dark' | null | undefined): { active: string; inactive: string; background: string; border: string }`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/lib/theme.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

const mockGet = jest.fn();
const mockSet = jest.fn();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...a: unknown[]) => mockGet(...a),
  setItemAsync: (...a: unknown[]) => mockSet(...a),
}));

import { ThemeProvider, useTheme, getTabBarColors } from './theme';

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(null);
  mockSet.mockReset().mockResolvedValue(undefined);
});

function Probe() {
  const { mode, setMode } = useTheme();
  return (
    <>
      <Text>mode:{mode}</Text>
      <Pressable accessibilityRole="button" onPress={() => setMode('light')}>
        <Text>set-light</Text>
      </Pressable>
    </>
  );
}

describe('getTabBarColors', () => {
  it('returns the light palette for light', () => {
    expect(getTabBarColors('light')).toEqual({
      active: '#0f9e88',
      inactive: '#5c6b64',
      background: '#ffffff',
      border: '#dbe5e0',
    });
  });

  it('returns the dark palette for dark or unknown', () => {
    const dark = { active: '#14bfa6', inactive: '#8a9a92', background: '#141d19', border: '#243029' };
    expect(getTabBarColors('dark')).toEqual(dark);
    expect(getTabBarColors(null)).toEqual(dark);
  });
});

describe('ThemeProvider', () => {
  it("defaults to 'system' when nothing is stored", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(await screen.findByText('mode:system')).toBeTruthy();
  });

  it('loads the stored preference on mount', async () => {
    mockGet.mockResolvedValue('dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(await screen.findByText('mode:dark')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('theme-preference');
  });

  it('persists and applies a new preference', async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'set-light' }));
    expect(await screen.findByText('mode:light')).toBeTruthy();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith('theme-preference', 'light'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/theme.test.tsx`
Expected: FAIL — `./theme` does not exist.

- [ ] **Step 3: Implement `lib/theme.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { ModeType } from '../components/ui/gluestack-ui-provider';

const STORAGE_KEY = 'theme-preference';
const MODES: ModeType[] = ['light', 'dark', 'system'];

type ThemeState = { mode: ModeType; setMode: (mode: ModeType) => void };

const ThemeContext = createContext<ThemeState | undefined>(undefined);

// Defaults to 'system' immediately (following the OS) and overrides once the
// stored preference loads — avoids a blank frame while SecureStore reads.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ModeType>('system');

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored && (MODES as string[]).includes(stored)) {
        setModeState(stored as ModeType);
      }
    });
  }, []);

  function setMode(next: ModeType) {
    setModeState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next);
  }

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// The tab bar sets native tint/background colors (not className styles), so it
// reads concrete hex per resolved scheme rather than the CSS vars.
export function getTabBarColors(scheme: 'light' | 'dark' | null | undefined) {
  if (scheme === 'light') {
    return { active: '#0f9e88', inactive: '#5c6b64', background: '#ffffff', border: '#dbe5e0' };
  }
  return { active: '#14bfa6', inactive: '#8a9a92', background: '#141d19', border: '#243029' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/theme.test.tsx`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/theme.tsx apps/mobile/lib/theme.test.tsx
git commit -m "feat(mobile): persisted theme provider + tab-bar color helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Wire theme into the app shell

Make the theme dynamic: the root provider reads the preference; the tab bar recolors per scheme. No route changes here (so no typedRoutes regen).

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `ThemeProvider`, `useTheme`, `getTabBarColors` (Task 2); `useColorScheme` from `nativewind`.

This task is integration wiring; its correctness is covered by tsc + the full mobile suite staying green (the pure color logic is unit-tested in Task 2). No new unit test is added.

- [ ] **Step 1: Rewrite `apps/mobile/app/_layout.tsx`**

```tsx
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
} from '@expo-google-fonts/plus-jakarta-sans';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GluestackUIProvider } from '../components/ui/gluestack-ui-provider';
import { AuthProvider } from '../lib/auth';
import { ThemeProvider, useTheme } from '../lib/theme';
import { queryClient } from '../lib/query';
import '../global.css';

SplashScreen.preventAutoHideAsync();

function ThemedApp() {
  const { mode } = useTheme();
  return (
    <GluestackUIProvider mode={mode}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </QueryClientProvider>
    </GluestackUIProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 2: Rewrite `apps/mobile/app/(app)/_layout.tsx`**

```tsx
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useSession } from '../../lib/auth';
import { getTabBarColors } from '../../lib/theme';

export default function AppLayout() {
  const { session, loading } = useSession();
  const { colorScheme } = useColorScheme();
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;
  const tab = getTabBarColors(colorScheme);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tab.active,
        tabBarInactiveTintColor: tab.inactive,
        tabBarStyle: { backgroundColor: tab.background, borderTopColor: tab.border },
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
        name="fora-de-casa"
        options={{
          title: 'Fora de casa',
          tabBarIcon: ({ color, size }) => <Ionicons name="compass-outline" color={color} size={size} />,
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

- [ ] **Step 3: Type-check + full mobile suite**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter @nutri-plus/mobile test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/_layout.tsx "apps/mobile/app/(app)/_layout.tsx"
git commit -m "feat(mobile): drive theme + tab bar from the persisted preference

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: shared-types `NutritionistContact`

The API↔mobile contract for the "view nutritionist" card.

**Files:**
- Create: `packages/shared-types/src/v1/nutritionist-contact.ts`
- Modify: `packages/shared-types/src/v1/index.ts`

**Interfaces:**
- Produces: `NutritionistContact { name: string; displayName: string | null; email: string; crn: string | null; logoUrl: string | null }`.

This is a types-only build artifact (no runtime test); verification is a clean build + downstream tsc.

- [ ] **Step 1: Create the interface**

`packages/shared-types/src/v1/nutritionist-contact.ts`:

```ts
// Basic, patient-facing view of the patient's nutritionist (GET /me/nutritionist).
export interface NutritionistContact {
  name: string;
  displayName: string | null;
  email: string;
  crn: string | null;
  logoUrl: string | null;
}
```

- [ ] **Step 2: Export it from the v1 barrel**

In `packages/shared-types/src/v1/index.ts`, add (keeping alphabetical-ish grouping is not required; append is fine):

```ts
export * from './nutritionist-contact';
```

- [ ] **Step 3: Build shared-types**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: build succeeds; `NutritionistContact` is now importable from `@nutri-plus/shared-types`.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/v1/nutritionist-contact.ts packages/shared-types/src/v1/index.ts
git commit -m "feat(shared-types): NutritionistContact for the patient nutritionist view

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: API — `getMyNutritionist` + `MeController` (GET)

**Files:**
- Create: `apps/api/src/patients/me.controller.ts`
- Modify: `apps/api/src/patients/patients.service.ts`
- Modify: `apps/api/src/patients/patients.module.ts`
- Test: `apps/api/src/patients/patients.service.spec.ts`

**Interfaces:**
- Consumes: `NutritionistContact` (Task 4); `resolveScopePatientId` (already imported in the service); `AuthContext` where `ctx.user.patientProfile` carries `nutritionistId`.
- Produces: `PatientsService.getMyNutritionist(ctx: AuthContext): Promise<NutritionistContact | null>`; `GET /v1/me/nutritionist` (`@Roles(PATIENT)`).

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/patients/patients.service.spec.ts`, add a `ctxPatient` helper near the other `ctx*` helpers (top of file):

```ts
function ctxPatient(patientProfileId: string | null, nutritionistId: string | null = null): AuthContext {
  return {
    authProviderId: 'sub-p',
    email: 'p@x.com',
    name: 'Ana',
    user: {
      id: 'user-p',
      authProviderId: 'auth-p',
      role: 'PATIENT',
      nutritionistProfile: null,
      employeeProfile: null,
      patientProfile: patientProfileId ? { id: patientProfileId, nutritionistId } : null,
    } as any,
  };
}
```

Add a new describe block at the end of the top-level `describe('PatientsService', ...)`:

```ts
  describe('getMyNutritionist', () => {
    it('maps the linked nutritionist profile + user fields', async () => {
      prisma.nutritionistProfile.findUnique.mockResolvedValue({
        displayName: 'Dra. Bia',
        crn: 'CRN-123',
        logoUrl: 'https://logo',
        user: { name: 'Beatriz', email: 'bia@x.com' },
      } as any);

      const result = await service.getMyNutritionist(ctxPatient('pp-1', 'nutri-1'));

      expect(prisma.nutritionistProfile.findUnique).toHaveBeenCalledWith({
        where: { id: 'nutri-1' },
        include: { user: { select: { name: true, email: true } } },
      });
      expect(result).toEqual({
        name: 'Beatriz',
        displayName: 'Dra. Bia',
        email: 'bia@x.com',
        crn: 'CRN-123',
        logoUrl: 'https://logo',
      });
    });

    it('returns null when the patient has no nutritionist', async () => {
      const result = await service.getMyNutritionist(ctxPatient('pp-1', null));
      expect(result).toBeNull();
      expect(prisma.nutritionistProfile.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a caller without a patient profile', async () => {
      await expect(service.getMyNutritionist(ctxPatient(null))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @nutri-plus/api test -- patients.service.spec`
Expected: FAIL — `service.getMyNutritionist` is not a function.

- [ ] **Step 3: Implement `getMyNutritionist`**

In `apps/api/src/patients/patients.service.ts`, add the import near the top:

```ts
import type { NutritionistContact } from '@nutri-plus/shared-types';
```

Add the method to the `PatientsService` class (e.g., after `listMyAssessments`):

```ts
  // The patient's own nutritionist, basic fields only. resolveScopePatientId
  // enforces the PATIENT scope; the linked id lives on the loaded profile.
  async getMyNutritionist(ctx: AuthContext): Promise<NutritionistContact | null> {
    resolveScopePatientId(ctx);
    const nutritionistId = ctx.user?.patientProfile?.nutritionistId ?? null;
    if (!nutritionistId) return null;

    const profile = await this.prisma.nutritionistProfile.findUnique({
      where: { id: nutritionistId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!profile) return null;

    return {
      name: profile.user.name,
      displayName: profile.displayName,
      email: profile.user.email,
      crn: profile.crn,
      logoUrl: profile.logoUrl,
    };
  }
```

- [ ] **Step 4: Create the controller**

`apps/api/src/patients/me.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { PatientsService } from './patients.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
@Roles(UserRole.PATIENT)
export class MeController {
  constructor(private readonly patients: PatientsService) {}

  @Get('nutritionist')
  getNutritionist(@CurrentUser() ctx: AuthContext) {
    return this.patients.getMyNutritionist(ctx);
  }
}
```

- [ ] **Step 5: Register the controller**

In `apps/api/src/patients/patients.module.ts`, import and add `MeController` to the `controllers` array:

```ts
import { MeController } from './me.controller';
```

```ts
  controllers: [PatientsController, PatientAssessmentsController, MeController],
```

- [ ] **Step 6: Run tests + type check**

Run: `pnpm --filter @nutri-plus/api test -- patients.service.spec`
Expected: PASS (3 new cases).

Run: `pnpm --filter @nutri-plus/api test`
Expected: full API suite green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/patients/me.controller.ts apps/api/src/patients/patients.service.ts apps/api/src/patients/patients.module.ts apps/api/src/patients/patients.service.spec.ts
git commit -m "feat(api): GET /me/nutritionist for the patient nutritionist view

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: API — `deleteMyAccount` + `MeController` (DELETE)

Hard-delete: an ordered teardown of all patient rows (children first, to clear the `onDelete: Restrict` links) inside one transaction, then remove the Supabase auth user so the email is freed.

**Files:**
- Modify: `apps/api/src/patients/patients.service.ts`
- Modify: `apps/api/src/patients/me.controller.ts`
- Test: `apps/api/src/patients/patients.service.spec.ts`

**Interfaces:**
- Consumes: `resolveScopePatientId`; `ctx.user.id`, `ctx.user.authProviderId`; `SupabaseAdminService.deleteUser` (best-effort, never throws).
- Produces: `PatientsService.deleteMyAccount(ctx: AuthContext): Promise<void>`; `DELETE /v1/me` (204).

- [ ] **Step 1: Write the failing tests**

Add a describe block at the end of `describe('PatientsService', ...)` in `patients.service.spec.ts`:

```ts
  describe('deleteMyAccount', () => {
    it('tears down patient rows in Restrict-safe order, then the auth user', async () => {
      prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));

      await service.deleteMyAccount(ctxPatient('pp-1', 'nutri-1'));

      expect(prisma.outsideHomeRequest.deleteMany).toHaveBeenCalledWith({ where: { patientId: 'pp-1' } });
      expect(prisma.aiInteraction.deleteMany).toHaveBeenCalledWith({ where: { patientId: 'pp-1' } });
      expect(prisma.appointment.deleteMany).toHaveBeenCalledWith({ where: { patientId: 'pp-1' } });
      expect(prisma.bodyAssessment.deleteMany).toHaveBeenCalledWith({ where: { patientId: 'pp-1' } });
      expect(prisma.mealPlan.deleteMany).toHaveBeenCalledWith({ where: { patientId: 'pp-1' } });
      expect(prisma.patientProfile.delete).toHaveBeenCalledWith({ where: { id: 'pp-1' } });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-p' } });

      // children before the profile; profile before the user
      const order = (m: { mock: { invocationCallOrder: number[] } }) => m.mock.invocationCallOrder[0];
      expect(order(prisma.bodyAssessment.deleteMany)).toBeLessThan(order(prisma.patientProfile.delete));
      expect(order(prisma.mealPlan.deleteMany)).toBeLessThan(order(prisma.patientProfile.delete));
      expect(order(prisma.patientProfile.delete)).toBeLessThan(order(prisma.user.delete));

      // frees the email; reads the id off ctx.user, not the top-level sub
      expect(supabaseAdmin.deleteUser).toHaveBeenCalledWith('auth-p');
    });

    it('rejects a caller without a patient profile and touches nothing', async () => {
      await expect(service.deleteMyAccount(ctxPatient(null))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(supabaseAdmin.deleteUser).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @nutri-plus/api test -- patients.service.spec`
Expected: FAIL — `service.deleteMyAccount` is not a function.

- [ ] **Step 3: Implement `deleteMyAccount`**

Add to `PatientsService` (after `getMyNutritionist`):

```ts
  // Permanently deletes the calling patient's account. Children are removed
  // first (Appointment/BodyAssessment/AIInteraction use onDelete: Restrict;
  // MealPlan children cascade), then the profile, then the local user — all in
  // one transaction. Only after it commits do we remove the Supabase auth user,
  // which frees the email for a future invite. deleteUser is best-effort (logs,
  // never throws), so a provider hiccup leaves an orphan to clean up rather than
  // resurrecting the now-deleted local data.
  async deleteMyAccount(ctx: AuthContext): Promise<void> {
    const patientId = resolveScopePatientId(ctx);
    const userId = ctx.user!.id;
    const authProviderId = ctx.user!.authProviderId;

    await this.prisma.$transaction(async (tx) => {
      await tx.outsideHomeRequest.deleteMany({ where: { patientId } });
      await tx.aiInteraction.deleteMany({ where: { patientId } });
      await tx.appointment.deleteMany({ where: { patientId } });
      await tx.bodyAssessment.deleteMany({ where: { patientId } });
      await tx.mealPlan.deleteMany({ where: { patientId } });
      await tx.patientProfile.delete({ where: { id: patientId } });
      await tx.user.delete({ where: { id: userId } });
    });

    await this.supabaseAdmin.deleteUser(authProviderId);
  }
```

- [ ] **Step 4: Add the DELETE route to the controller**

In `apps/api/src/patients/me.controller.ts`, extend the imports and add the method:

```ts
import { Controller, Delete, Get, HttpCode } from '@nestjs/common';
```

```ts
  @Delete()
  @HttpCode(204)
  deleteAccount(@CurrentUser() ctx: AuthContext) {
    return this.patients.deleteMyAccount(ctx);
  }
```

- [ ] **Step 5: Run tests + type check**

Run: `pnpm --filter @nutri-plus/api test -- patients.service.spec`
Expected: PASS (2 new cases).

Run: `pnpm --filter @nutri-plus/api test`
Expected: full API suite green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/patients/patients.service.ts apps/api/src/patients/me.controller.ts apps/api/src/patients/patients.service.spec.ts
git commit -m "feat(api): DELETE /me hard-deletes the patient account + frees the email

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Mobile — `useMyNutritionist` query

**Files:**
- Create: `apps/mobile/lib/queries/nutritionist.ts`
- Test: `apps/mobile/lib/queries/nutritionist.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (`../api`); `NutritionistContact` (`@nutri-plus/shared-types`).
- Produces: `useMyNutritionist()` — React Query hook, key `['me', 'nutritionist']`, data `NutritionistContact | null`.

- [ ] **Step 1: Write the failing test**

`apps/mobile/lib/queries/nutritionist.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

const mockApiFetch = jest.fn();
jest.mock('../api', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

import { useMyNutritionist } from './nutritionist';

beforeEach(() => {
  mockApiFetch.mockReset();
});

function Probe() {
  const query = useMyNutritionist();
  if (!query.isSuccess) return <Text>loading</Text>;
  return <Text>{query.data ? `name:${query.data.name}` : 'none'}</Text>;
}

function renderProbe() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<Probe />, { wrapper });
}

describe('useMyNutritionist', () => {
  it('GETs /me/nutritionist and exposes the contact', async () => {
    mockApiFetch.mockResolvedValue({
      name: 'Beatriz',
      displayName: 'Dra. Bia',
      email: 'bia@x.com',
      crn: 'CRN-123',
      logoUrl: null,
    });
    renderProbe();
    expect(await screen.findByText('name:Beatriz')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/me/nutritionist');
  });

  it('handles a null contact (no nutritionist)', async () => {
    mockApiFetch.mockResolvedValue(null);
    renderProbe();
    expect(await screen.findByText('none')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/queries/nutritionist.test.tsx`
Expected: FAIL — `./nutritionist` does not exist.

- [ ] **Step 3: Implement the hook**

`apps/mobile/lib/queries/nutritionist.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { NutritionistContact } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function useMyNutritionist() {
  return useQuery({
    queryKey: ['me', 'nutritionist'],
    queryFn: () => apiFetch<NutritionistContact | null>('/me/nutritionist'),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/queries/nutritionist.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/queries/nutritionist.ts apps/mobile/lib/queries/nutritionist.test.tsx
git commit -m "feat(mobile): useMyNutritionist query

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Mobile — `changePasswordSchema`

**Files:**
- Modify: `apps/mobile/lib/validation/auth.ts`
- Test: `apps/mobile/lib/validation/auth.test.ts`

**Interfaces:**
- Produces: `changePasswordSchema` (zod) + `ChangePasswordValues` = `{ currentPassword: string; password: string; confirmPassword: string }`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/lib/validation/auth.test.ts`:

```ts
import { changePasswordSchema } from './auth';

describe('changePasswordSchema', () => {
  const base = { currentPassword: 'old12345', password: 'new12345', confirmPassword: 'new12345' };

  it('accepts a valid change', () => {
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
  });

  it('requires the current password', () => {
    const r = changePasswordSchema.safeParse({ ...base, currentPassword: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Informe sua senha atual.');
  });

  it('requires at least 8 chars for the new password', () => {
    const r = changePasswordSchema.safeParse({ ...base, password: 'short', confirmPassword: 'short' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('A senha deve ter ao menos 8 caracteres.');
  });

  it('rejects a mismatched confirmation', () => {
    const r = changePasswordSchema.safeParse({ ...base, confirmPassword: 'different' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('As senhas não coincidem.');
      expect(r.error.issues[0].path).toEqual(['confirmPassword']);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/validation/auth.test.ts`
Expected: FAIL — `changePasswordSchema` is not exported.

- [ ] **Step 3: Add the schema**

Append to `apps/mobile/lib/validation/auth.ts`:

```ts
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe sua senha atual.'),
    password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/validation/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/validation/auth.ts apps/mobile/lib/validation/auth.test.ts
git commit -m "feat(mobile): changePasswordSchema (re-auth + confirm)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Mobile — Configurações stack + change-password screen

Convert the flat `configuracoes.tsx` tab into a stack and add the change-password screen. The index keeps its current content for now (Task 10 rewrites it).

**Files:**
- Move: `apps/mobile/app/(app)/configuracoes.tsx` → `apps/mobile/app/(app)/configuracoes/index.tsx` (content unchanged in this task)
- Create: `apps/mobile/app/(app)/configuracoes/_layout.tsx`
- Create: `apps/mobile/app/(app)/configuracoes/senha.tsx`
- Test: `apps/mobile/app/(app)/configuracoes/senha.test.tsx`

**Interfaces:**
- Consumes: `changePasswordSchema`, `ChangePasswordValues` (Task 8); `useSession` (`../../../lib/auth`); `supabase`, `mapAuthError`; `Screen`/`TextField`/`Button`.
- Produces: the route `/configuracoes/senha` (typed).

- [ ] **Step 1: Move the flat file into the stack directory + fix its imports**

```bash
git mv "apps/mobile/app/(app)/configuracoes.tsx" "apps/mobile/app/(app)/configuracoes/index.tsx"
```

The file is now one directory deeper, so its relative imports need one more `../`. Set `apps/mobile/app/(app)/configuracoes/index.tsx` to exactly (content otherwise unchanged — still email + "Sair"; Task 10 rewrites it):

```tsx
import { Text, View } from 'react-native';
import { useSession } from '../../../lib/auth';
import { Button } from '../../../components/ui/button';

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

- [ ] **Step 2: Create the stack layout**

`apps/mobile/app/(app)/configuracoes/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function ConfiguracoesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 3: Write the failing test for the change-password screen**

`apps/mobile/app/(app)/configuracoes/senha.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockSignIn = jest.fn();
const mockUpdateUser = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (a: unknown) => mockSignIn(a),
      updateUser: (a: unknown) => mockUpdateUser(a),
    },
  },
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), push: jest.fn() },
}));

jest.mock('../../../lib/auth', () => ({
  useSession: () => ({ session: { user: { email: 'a@x.com' } }, signOut: jest.fn() }),
}));

import AlterarSenha from './senha';

beforeEach(() => {
  mockSignIn.mockReset().mockResolvedValue({ error: null });
  mockUpdateUser.mockReset().mockResolvedValue({ error: null });
  mockBack.mockReset();
});

async function fillValid() {
  await fireEvent.changeText(screen.getByLabelText('Senha atual'), 'old12345');
  await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'new12345');
  await fireEvent.changeText(screen.getByLabelText('Confirmar nova senha'), 'new12345');
}

describe('Change password screen', () => {
  it('renders the three fields', async () => {
    await render(<AlterarSenha />);
    expect(screen.getByLabelText('Senha atual')).toBeTruthy();
    expect(screen.getByLabelText('Nova senha')).toBeTruthy();
    expect(screen.getByLabelText('Confirmar nova senha')).toBeTruthy();
  });

  it('re-authenticates then updates the password and goes back', async () => {
    await render(<AlterarSenha />);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: /salvar nova senha/i }));
    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith({ email: 'a@x.com', password: 'old12345' }),
    );
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'new12345' }));
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows an error and does not update when the current password is wrong', async () => {
    mockSignIn.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'invalid' } });
    await render(<AlterarSenha />);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: /salvar nova senha/i }));
    expect(await screen.findByText('Senha atual incorreta.')).toBeTruthy();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows the zod message for non-matching passwords and calls no supabase', async () => {
    await render(<AlterarSenha />);
    await fireEvent.changeText(screen.getByLabelText('Senha atual'), 'old12345');
    await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'new12345');
    await fireEvent.changeText(screen.getByLabelText('Confirmar nova senha'), 'other12345');
    await fireEvent.press(screen.getByRole('button', { name: /salvar nova senha/i }));
    expect(await screen.findByText('As senhas não coincidem.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('maps a weak-password rejection from updateUser and stays', async () => {
    mockUpdateUser.mockResolvedValue({ error: { code: 'weak_password', message: 'weak' } });
    await render(<AlterarSenha />);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: /salvar nova senha/i }));
    expect(await screen.findByText('A senha é muito fraca. Use ao menos 8 caracteres.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(app\)/configuracoes/senha.test.tsx"`
Expected: FAIL — `./senha` does not exist.

- [ ] **Step 5: Implement the change-password screen**

`apps/mobile/app/(app)/configuracoes/senha.tsx`:

```tsx
import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { changePasswordSchema, type ChangePasswordValues } from '../../../lib/validation/auth';
import { mapAuthError } from '../../../lib/auth/errors';
import { Button } from '../../../components/ui/button';
import { TextField } from '../../../components/ui/text-field';
import { Screen } from '../../../components/ui/screen';

export default function AlterarSenha() {
  const { session } = useSession();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: ChangePasswordValues) {
    setFormError(null);
    const email = session?.user.email ?? '';
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: values.currentPassword,
    });
    if (signInError) {
      setFormError('Senha atual incorreta.');
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: values.password });
    if (updateError) {
      setFormError(mapAuthError(updateError));
      return;
    }
    router.back();
  }

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-8">
        <View className="gap-1">
          <Text className="font-heading-semibold text-2xl text-foreground">Alterar senha</Text>
          <Text className="font-sans text-base text-muted-foreground">
            Confirme sua senha atual e escolha uma nova.
          </Text>
        </View>

        <View className="gap-4">
          <Controller
            control={control}
            name="currentPassword"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Senha atual"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                autoComplete="current-password"
                placeholder="••••••••"
                error={errors.currentPassword?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Nova senha"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                autoComplete="new-password"
                placeholder="••••••••"
                error={errors.password?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Confirmar nova senha"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                autoComplete="new-password"
                placeholder="••••••••"
                error={errors.confirmPassword?.message}
              />
            )}
          />

          {formError ? <Text className="font-sans text-sm text-destructive">{formError}</Text> : null}

          <Button label="Salvar nova senha" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
        </View>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 6: Regenerate typed routes, then run tests + type check**

Run (regenerates `.expo/types/router.d.ts` for the new `/configuracoes/senha` route; non-destructive to `tsconfig.json` — if prompted, choose `tsconfig.json`):

`pnpm --filter @nutri-plus/mobile exec expo customize tsconfig.json`

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(app\)/configuracoes/senha.test.tsx"`
Expected: PASS (5 cases).

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

`.expo/` is git-ignored, so staging the directory won't pick up regenerated router types.

```bash
git add "apps/mobile/app/(app)/configuracoes"
git commit -m "feat(mobile): configuracoes stack + change-password screen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Mobile — Configurações index screen

Rewrite the index into the full settings list: nutritionist card, "Alterar senha" link, theme selector, "Sair", and "Apagar minha conta" (native confirm → `DELETE /me` → sign out).

**Files:**
- Modify: `apps/mobile/app/(app)/configuracoes/index.tsx`
- Test: `apps/mobile/app/(app)/configuracoes/index.test.tsx`

**Interfaces:**
- Consumes: `useSession` (`signOut`), `useTheme` (`mode`/`setMode`), `useMyNutritionist`, `apiFetch`, `router`, `Alert`, `ModeType`, `Screen`.

- [ ] **Step 1: Write the failing test**

`apps/mobile/app/(app)/configuracoes/index.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockSignOut = jest.fn();
jest.mock('../../../lib/auth', () => ({
  useSession: () => ({ session: { user: { email: 'a@x.com' } }, signOut: mockSignOut }),
}));

const mockSetMode = jest.fn();
let mockMode = 'system';
jest.mock('../../../lib/theme', () => ({
  useTheme: () => ({ mode: mockMode, setMode: mockSetMode }),
}));

let mockNutritionist: { isLoading: boolean; data: unknown };
jest.mock('../../../lib/queries/nutritionist', () => ({
  useMyNutritionist: () => mockNutritionist,
}));

const mockApiFetch = jest.fn();
jest.mock('../../../lib/api', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (h: unknown) => mockPush(h), back: jest.fn() } }));

import ConfiguracoesIndex from './index';

beforeEach(() => {
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockSetMode.mockReset();
  mockMode = 'system';
  mockApiFetch.mockReset().mockResolvedValue(null);
  mockPush.mockReset();
  mockNutritionist = {
    isLoading: false,
    data: { name: 'Beatriz', displayName: 'Dra. Bia', email: 'bia@x.com', crn: 'CRN-123', logoUrl: null },
  };
});

describe('Configurações index', () => {
  it('shows the nutritionist display name, email, and CRN', async () => {
    await render(<ConfiguracoesIndex />);
    expect(screen.getByText('Dra. Bia')).toBeTruthy();
    expect(screen.getByText('bia@x.com')).toBeTruthy();
    expect(screen.getByText('CRN CRN-123')).toBeTruthy();
  });

  it('shows an empty state when there is no nutritionist', async () => {
    mockNutritionist = { isLoading: false, data: null };
    await render(<ConfiguracoesIndex />);
    expect(screen.getByText('Nenhum nutricionista vinculado.')).toBeTruthy();
  });

  it('navigates to the change-password screen', async () => {
    await render(<ConfiguracoesIndex />);
    await fireEvent.press(screen.getByText('Alterar senha'));
    expect(mockPush).toHaveBeenCalledWith('/configuracoes/senha');
  });

  it('sets the theme when an option is tapped', async () => {
    await render(<ConfiguracoesIndex />);
    await fireEvent.press(screen.getByText('Claro'));
    expect(mockSetMode).toHaveBeenCalledWith('light');
  });

  it('logs out', async () => {
    await render(<ConfiguracoesIndex />);
    await fireEvent.press(screen.getByText('Sair'));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('confirms, deletes the account, and signs out', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<ConfiguracoesIndex />);
    await fireEvent.press(screen.getByText('Apagar minha conta'));

    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const apagar = buttons.find((b) => b.text === 'Apagar');
    await apagar?.onPress?.();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/me', { method: 'DELETE' }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    alertSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(app\)/configuracoes/index.test.tsx"`
Expected: FAIL — the index still renders the old email/Sair content, missing the new elements.

- [ ] **Step 3: Rewrite the index screen**

Replace `apps/mobile/app/(app)/configuracoes/index.tsx` entirely:

```tsx
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '../../../lib/auth';
import { useTheme } from '../../../lib/theme';
import { useMyNutritionist } from '../../../lib/queries/nutritionist';
import { apiFetch } from '../../../lib/api';
import { Screen } from '../../../components/ui/screen';
import type { ModeType } from '../../../components/ui/gluestack-ui-provider';

const THEME_OPTIONS: { label: string; value: ModeType }[] = [
  { label: 'Claro', value: 'light' },
  { label: 'Escuro', value: 'dark' },
  { label: 'Sistema', value: 'system' },
];

export default function ConfiguracoesIndex() {
  const { signOut } = useSession();
  const { mode, setMode } = useTheme();
  const nutritionist = useMyNutritionist();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function onDelete() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await apiFetch('/me', { method: 'DELETE' });
      await signOut();
    } catch {
      setDeleteError('Não foi possível apagar sua conta. Tente novamente.');
      setDeleting(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Apagar conta',
      'Isso apagará permanentemente sua conta e todos os seus dados — avaliações, planos e histórico. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Apagar', style: 'destructive', onPress: onDelete },
      ],
    );
  }

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-8">
        <Text className="font-heading text-2xl text-foreground">Configurações</Text>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm uppercase text-muted-foreground">Meu nutricionista</Text>
          <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
            {nutritionist.isLoading ? (
              <ActivityIndicator color="#14bfa6" />
            ) : nutritionist.data ? (
              <>
                {nutritionist.data.logoUrl ? (
                  <Image source={{ uri: nutritionist.data.logoUrl }} className="h-12 w-12 rounded-full" />
                ) : null}
                <View className="min-w-0 flex-1">
                  <Text className="font-sans-medium text-base text-foreground">
                    {nutritionist.data.displayName ?? nutritionist.data.name}
                  </Text>
                  <Text className="font-sans text-sm text-muted-foreground">{nutritionist.data.email}</Text>
                  {nutritionist.data.crn ? (
                    <Text className="font-sans text-sm text-muted-foreground">CRN {nutritionist.data.crn}</Text>
                  ) : null}
                </View>
              </>
            ) : (
              <Text className="font-sans text-sm text-muted-foreground">Nenhum nutricionista vinculado.</Text>
            )}
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm uppercase text-muted-foreground">Conta</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/configuracoes/senha')}
            className="rounded-xl border border-border bg-card p-4"
          >
            <Text className="font-sans-medium text-base text-foreground">Alterar senha</Text>
          </Pressable>
        </View>

        <View className="gap-2">
          <Text className="font-sans-medium text-sm uppercase text-muted-foreground">Aparência</Text>
          <View className="flex-row gap-2">
            {THEME_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                onPress={() => setMode(opt.value)}
                className={`flex-1 items-center rounded-xl border p-3 ${
                  mode === opt.value ? 'border-primary bg-secondary' : 'border-border bg-card'
                }`}
              >
                <Text
                  className={`font-sans-medium text-sm ${
                    mode === opt.value ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={signOut}
          className="rounded-xl border border-border bg-card p-4"
        >
          <Text className="font-sans-medium text-base text-foreground">Sair</Text>
        </Pressable>

        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            disabled={deleting}
            className="rounded-xl border border-destructive p-4"
          >
            <Text className="text-center font-sans-medium text-base text-destructive">
              {deleting ? 'Apagando…' : 'Apagar minha conta'}
            </Text>
          </Pressable>
          {deleteError ? (
            <Text className="font-sans text-sm text-destructive">{deleteError}</Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 4: Run test + type check + full mobile suite**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(app\)/configuracoes/index.test.tsx"`
Expected: PASS (6 cases).

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter @nutri-plus/mobile test`
Expected: full mobile suite green.

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/app/(app)/configuracoes/index.tsx" "apps/mobile/app/(app)/configuracoes/index.test.tsx"
git commit -m "feat(mobile): Configurações index — nutritionist, theme, logout, delete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- `pnpm --filter @nutri-plus/shared-types build` — green.
- `pnpm --filter @nutri-plus/api test` — green (≈195 + 5 new).
- `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` — clean.
- `pnpm --filter @nutri-plus/mobile test` — green (≈55 + new).
- Manual (Expo Go, needs a patient login on the shared dev DB): open Configurações → nutritionist card shows; toggle Claro/Escuro/Sistema (whole app + tab bar recolor; preference survives an app restart); Alterar senha (wrong current → error; valid → returns to settings, new password works on next login); Apagar minha conta → confirm → returns to login and the email can be re-invited from the web.
