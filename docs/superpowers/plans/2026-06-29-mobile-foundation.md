# Mobile App Foundation (Expo) + Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the patient-facing Expo app in `apps/mobile` (navigation, theme matching the web, Supabase auth, API client, fonts) with a working login screen and an auth-gated placeholder tab shell.

**Architecture:** Expo + Expo Router (file-based, `(auth)`/`(app)` groups). NativeWind v4 for styling with the web's exact palette + gluestack-ui v2 primitives; Supabase JS (secure-store session) for auth; React Query + a small `apiFetch` for the API. The risky part is toolchain/config in a pnpm monorepo, so Task 1 gets a **booting, smoke-tested** scaffold before any features are layered on.

**Tech Stack:** Expo (latest SDK) · Expo Router · TypeScript · NativeWind v4 · gluestack-ui v2 · @supabase/supabase-js · expo-secure-store · @tanstack/react-query · react-hook-form + zod · @expo-google-fonts (Sora, Plus Jakarta Sans) · jest-expo + @testing-library/react-native.

## Global Constraints

- **Branch:** `feat/mobile-foundation` (spec committed there).
- **Workspace package `@nutri-plus/mobile`** in `apps/mobile` (matches `@nutri-plus/web`/`api`/`shared-types`). Consumes `@nutri-plus/shared-types`.
- **Identity tokens (dark-first, from the web):** primary `#14bfa6` (fg `#04241b`), background `#0d1411`, card `#141d19`, foreground `#e7ece9`, secondary `#1a2520`/fg `#a7d8c9`, muted `#161f1b`/fg `#8a9a92`, accent `#1a2520`/fg `#a7d8c9`, destructive `#e5484d`/fg `#ffffff`, border `#243029`, input `#2c3a33`, radius `0.75rem`. Fonts: **Sora** (headings) + **Plus Jakarta Sans** (body).
- **Auth:** Supabase `signInWithPassword`, same project as web; session in **expo-secure-store**; `autoRefreshToken`/`persistSession` true, `detectSessionInUrl` false. **Login-only** this phase.
- **Env (client-exposed):** `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Login copy/messages mirror the web (pt-BR): "Informe um e-mail válido.", "Informe sua senha.", invalid credentials → "E-mail ou senha inválidos.".
- **Config caveat:** exact NativeWind v4 / gluestack-ui v2 / Expo setup can vary by installed version. Where a step says "run the official init", follow the installed version's setup and **adapt the generated config**; the binding gate is that the verification commands pass (`tsc --noEmit`, the jest-expo smoke render, `expo config` resolves). Do NOT invent versions — use what `expo install` / the init tools pick.
- **Quotes:** SINGLE quotes in authored `.ts`/`.tsx`. Relative imports in authored files (no `@/` alias assumption). Commit trailer: end every commit with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT commit `node_modules` or generated native dirs (`android/`, `ios/`); ensure `.gitignore` covers them.
- **Non-interactive only:** never run a blocking `expo start`/`expo run` in a task; verify with `tsc`, `expo config`, and jest-expo (all exit on their own).

---

### Task 1: Scaffold Expo app + monorepo wiring (boots + smoke test)

**Files:**
- Create: `apps/mobile/package.json`, `apps/mobile/app.config.ts`, `apps/mobile/tsconfig.json`, `apps/mobile/babel.config.js`, `apps/mobile/metro.config.js`, `apps/mobile/.gitignore`, `apps/mobile/.env.example`, `apps/mobile/jest.config.js`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`
- Create: `apps/mobile/__tests__/smoke.test.tsx`
- Create/Modify: repo-root `.npmrc` (ensure `node-linker=hoisted`)
- Remove: `apps/mobile/.gitkeep`

**Interfaces:**
- Produces: a bootable Expo Router app at `apps/mobile` resolvable by Metro in the pnpm monorepo; scripts `start`/`android`/`ios`/`test`/`typecheck`; a passing jest-expo smoke test. Consumed by all later tasks.

- [ ] **Step 1: Scaffold the Expo app in place**

From the repo root, create the app with the default (Expo Router + TypeScript) template into `apps/mobile`:

Run: `pnpm dlx create-expo-app@latest apps/mobile --template default` (if the dir is non-empty due to `.gitkeep`/`README.md`, scaffold in a temp dir and move the files in, or remove `.gitkeep` first: `rm apps/mobile/.gitkeep`). Then remove the example screens the template ships (e.g. `apps/mobile/app/(tabs)`, `components/`, `constants/`, `hooks/`, `scripts/`, `app/+not-found.tsx`) so `app/` is minimal — we author our own structure in later tasks.

Expected: `apps/mobile` has an Expo project (its own `package.json`, `app.json`/`app.config`, `tsconfig.json`, `app/`), Expo Router installed.

- [ ] **Step 2: Set the workspace package identity + scripts**

Set `apps/mobile/package.json` `"name"` to `@nutri-plus/mobile`, add `"@nutri-plus/shared-types": "workspace:^"` to dependencies, and ensure these scripts exist:

```json
{
  "name": "@nutri-plus/mobile",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  }
}
```

Run `pnpm install` from the repo root so the workspace links.

- [ ] **Step 3: Ensure pnpm hoisting for Metro**

Ensure the repo-root `.npmrc` contains `node-linker=hoisted` (create the file with that line if it doesn't exist; append if the file exists without it). Re-run `pnpm install` if you changed it. (Metro can't resolve pnpm's default symlinked store; hoisting fixes it.)

- [ ] **Step 4: Monorepo-aware Metro config**

Write `apps/mobile/metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

(NativeWind's `withNativeWind` wrapper is added in Task 2 — keep this plain for now so the scaffold boots first.)

- [ ] **Step 5: app.config.ts + env example**

Replace `app.json` with `apps/mobile/app.config.ts`:

```ts
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'iNutri',
  slug: 'nutri-plus-mobile',
  scheme: 'nutriplus',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  ios: { supportsTablet: true },
  android: {},
  plugins: ['expo-router', 'expo-secure-store', 'expo-font'],
  experiments: { typedRoutes: true },
};

export default config;
```

Create `apps/mobile/.env.example`:

```
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

(Confirm `apps/mobile/.gitignore` ignores `node_modules/`, `.env*.local`, `/android`, `/ios`, `.expo/`, `expo-env.d.ts`. Add any missing.)

- [ ] **Step 6: Minimal root layout + index (temporary)**

Write a minimal `apps/mobile/app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

Write `apps/mobile/app/index.tsx`:

```tsx
import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>iNutri</Text>
    </View>
  );
}
```

- [ ] **Step 7: jest-expo setup + smoke test**

Install test deps: `npx expo install jest-expo jest @testing-library/react-native react-test-renderer --dev` (use the versions expo picks). Write `apps/mobile/jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|@gluestack-ui/.*|@legendapp/.*|@supabase/.*))',
  ],
};
```

Write `apps/mobile/__tests__/smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import Index from '../app/index';

describe('scaffold smoke', () => {
  it('renders the index screen', () => {
    render(<Index />);
    expect(screen.getByText('iNutri')).toBeTruthy();
  });
});
```

- [ ] **Step 8: Verify the scaffold boots**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: exits 0.

Run: `pnpm --filter @nutri-plus/mobile exec expo config --type public > /dev/null && echo OK`
Expected: prints `OK` (Expo resolves the config/plugins without error).

Run: `pnpm --filter @nutri-plus/mobile test`
Expected: the smoke test passes.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile .npmrc pnpm-lock.yaml
git commit -m "feat(mobile): scaffold Expo Router app in the monorepo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(Confirm `git status` shows no `apps/mobile/node_modules`, `android/`, or `ios/` staged.)

---

### Task 2: Styling — NativeWind v4 tokens + gluestack-ui v2 + fonts

**Files:**
- Create: `apps/mobile/global.css`, `apps/mobile/tailwind.config.js`, `apps/mobile/nativewind-env.d.ts`
- Modify: `apps/mobile/metro.config.js`, `apps/mobile/babel.config.js`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`
- Create (via gluestack init): `apps/mobile/components/ui/gluestack-ui-provider/*`
- Test: `apps/mobile/__tests__/theme.test.tsx`

**Interfaces:**
- Consumes: the booting scaffold (Task 1).
- Produces: NativeWind `className` styling with the web palette (`bg-background`, `text-primary`, etc.), a `GluestackUIProvider` (dark) wrapping the app, and the Sora/Jakarta fonts loaded. Consumed by Tasks 3–4.

- [ ] **Step 1: Install NativeWind v4 + gluestack + fonts**

Run: `npx expo install nativewind tailwindcss react-native-reanimated react-native-safe-area-context` and `npx expo install @expo-google-fonts/sora @expo-google-fonts/plus-jakarta-sans expo-font expo-splash-screen`. Initialize gluestack-ui v2: `npx gluestack-ui@latest init` (accept its NativeWind-based setup; it generates `components/ui/gluestack-ui-provider` + its config and may edit `tailwind.config`/`global.css` — that's expected).

- [ ] **Step 2: Tailwind config with the web palette**

Write `apps/mobile/tailwind.config.js` (merge with anything gluestack's init added — keep gluestack's `content`/preset entries AND ours):

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#0d1411',
        foreground: '#e7ece9',
        card: '#141d19',
        border: '#243029',
        input: '#2c3a33',
        primary: { DEFAULT: '#14bfa6', foreground: '#04241b' },
        secondary: { DEFAULT: '#1a2520', foreground: '#a7d8c9' },
        muted: { DEFAULT: '#161f1b', foreground: '#8a9a92' },
        accent: { DEFAULT: '#1a2520', foreground: '#a7d8c9' },
        destructive: { DEFAULT: '#e5484d', foreground: '#ffffff' },
      },
      borderRadius: { sm: '8px', md: '10px', lg: '12px', xl: '16px' },
      fontFamily: {
        heading: ['Sora_700Bold'],
        'heading-semibold': ['Sora_600SemiBold'],
        sans: ['PlusJakartaSans_400Regular'],
        medium: ['PlusJakartaSans_500Medium'],
      },
    },
  },
  plugins: [],
};
```

Write `apps/mobile/global.css` (keep any gluestack directives its init added, plus):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Write `apps/mobile/nativewind-env.d.ts`:

```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 3: Wire NativeWind into Metro + Babel**

Update `apps/mobile/metro.config.js` to wrap with NativeWind (keep the monorepo settings from Task 1):

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: './global.css' });
```

Write `apps/mobile/babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
```

- [ ] **Step 4: Load fonts + providers in the root layout**

Rewrite `apps/mobile/app/_layout.tsx`:

```tsx
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
} from '@expo-google-fonts/plus-jakarta-sans';
import { GluestackUIProvider } from '../components/ui/gluestack-ui-provider';
import '../global.css';

SplashScreen.preventAutoHideAsync();

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
    <GluestackUIProvider mode="dark">
      <Stack screenOptions={{ headerShown: false }} />
    </GluestackUIProvider>
  );
}
```

(If gluestack's `GluestackUIProvider` prop for dark mode differs in the installed version, use whatever the generated provider exposes — the gate is that it renders in the theme test.)

- [ ] **Step 5: Style the index screen with NativeWind (proof)**

Rewrite `apps/mobile/app/index.tsx` to use `className` with our tokens:

```tsx
import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="font-heading text-2xl text-primary">iNutri</Text>
    </View>
  );
}
```

- [ ] **Step 6: Theme render test**

Write `apps/mobile/__tests__/theme.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import Index from '../app/index';

describe('themed index', () => {
  it('renders the branded title with NativeWind classes', () => {
    render(<Index />);
    expect(screen.getByText('iNutri')).toBeTruthy();
  });
});
```

- [ ] **Step 7: Verify**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: exits 0 (NativeWind types via `nativewind-env.d.ts`; `className` accepted on RN components).

Run: `pnpm --filter @nutri-plus/mobile test`
Expected: smoke + theme tests pass (proves the babel/metro/NativeWind/gluestack transform renders under jest).

Run: `pnpm --filter @nutri-plus/mobile exec expo config --type public > /dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): NativeWind theme (web palette) + gluestack-ui + fonts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Data + auth libraries (Supabase, API, validation, error mapping)

**Files:**
- Create: `apps/mobile/lib/supabase.ts`, `apps/mobile/lib/auth.tsx`, `apps/mobile/lib/api.ts`, `apps/mobile/lib/query.ts`, `apps/mobile/lib/validation/auth.ts`, `apps/mobile/lib/auth/errors.ts`
- Test: `apps/mobile/lib/auth/errors.test.ts`, `apps/mobile/lib/validation/auth.test.ts`, `apps/mobile/lib/api.test.ts`

**Interfaces:**
- Consumes: `@supabase/supabase-js`, `expo-secure-store`, `@tanstack/react-query`, `zod`.
- Produces: `supabase` client; `AuthProvider` + `useSession(): { session, loading, signOut }`; `apiFetch<T>(path, opts)` + `ApiError`; `queryClient`; `loginSchema`/`LoginValues`; `mapAuthError(error): string`. Consumed by Task 4.

- [ ] **Step 1: Install deps**

Run: `npx expo install @supabase/supabase-js expo-secure-store react-native-url-polyfill` and `pnpm --filter @nutri-plus/mobile add @tanstack/react-query zod react-hook-form @hookform/resolvers`.

- [ ] **Step 2: Write the failing unit tests**

Write `apps/mobile/lib/auth/errors.test.ts`:

```ts
import { mapAuthError } from './errors';

describe('mapAuthError', () => {
  it('maps invalid credentials to a friendly pt-BR message', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' })).toBe('E-mail ou senha inválidos.');
  });
  it('falls back to a generic message', () => {
    expect(mapAuthError({ message: 'network boom' })).toBe('Algo deu errado. Tente novamente.');
    expect(mapAuthError(null)).toBe('Algo deu errado. Tente novamente.');
  });
});
```

Write `apps/mobile/lib/validation/auth.test.ts`:

```ts
import { loginSchema } from './auth';

describe('loginSchema', () => {
  it('rejects an invalid email and an empty password', () => {
    const r = loginSchema.safeParse({ email: 'nope', password: '' });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain('Informe um e-mail válido.');
    expect(msgs).toContain('Informe sua senha.');
  });
  it('accepts a valid login', () => {
    expect(loginSchema.safeParse({ email: 'a@x.com', password: 'secret' }).success).toBe(true);
  });
});
```

(The `api.test.ts` is authored in Step 4, alongside the Supabase mock it needs — jest globals, no vitest; mobile tests run under jest-expo.)

- [ ] **Step 3: Implement the libs**

`apps/mobile/lib/supabase.ts`:

```ts
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set');
}

// Supabase persists its session through this adapter (encrypted at rest).
const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

`apps/mobile/lib/auth/errors.ts`:

```ts
const GENERIC = 'Algo deu errado. Tente novamente.';

export function mapAuthError(error: { message?: string } | null | undefined): string {
  const msg = error?.message?.toLowerCase() ?? '';
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar.';
  }
  return GENERIC;
}
```

`apps/mobile/lib/validation/auth.ts`:

```ts
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});

export type LoginValues = z.infer<typeof loginSchema>;
```

`apps/mobile/lib/query.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();
```

`apps/mobile/lib/api.ts`:

```ts
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new Error('EXPO_PUBLIC_API_URL is not set');

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  const res = await fetch(`${base}/v1${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}
```

`apps/mobile/lib/auth.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AuthState = {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useSession(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useSession must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Author the api test (jest) + shared supabase mock**

Create `apps/mobile/__mocks__/` is not needed; mock inline. Write `apps/mobile/lib/api.test.ts` with jest globals:

```ts
const getSession = jest.fn();
jest.mock('./supabase', () => ({ supabase: { auth: { getSession: () => getSession() } } }));

import { apiFetch, ApiError } from './api';

const fetchMock = jest.fn();

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

describe('apiFetch', () => {
  it('sends the bearer token to {base}/v1{path} and parses JSON', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: () => Promise.resolve('{"id":"p1"}') });
    const result = await apiFetch<{ id: string }>('/me/meal-plans');
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/v1/me/meal-plans', {
      method: 'GET',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer tok' },
      body: undefined,
    });
    expect(result).toEqual({ id: 'p1' });
  });

  it('throws ApiError on a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('nope') });
    await expect(apiFetch('/me/meal-plans')).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @nutri-plus/mobile test`
Expected: `errors`, `auth` (validation), and `api` suites pass (plus the earlier smoke/theme).

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): supabase client, auth context, api client, validation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Navigation shell + login screen + UI wrappers

**Files:**
- Create: `apps/mobile/components/ui/button.tsx`, `apps/mobile/components/ui/text-field.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (add QueryClient + AuthProvider)
- Delete: `apps/mobile/app/index.tsx` (replaced by group routing)
- Create: `apps/mobile/app/(auth)/_layout.tsx`, `apps/mobile/app/(auth)/login.tsx`, `apps/mobile/app/(app)/_layout.tsx`, `apps/mobile/app/(app)/index.tsx`, `apps/mobile/app/(app)/planos.tsx`, `apps/mobile/app/(app)/perfil.tsx`
- Test: `apps/mobile/app/(auth)/login.test.tsx`

**Interfaces:**
- Consumes: `useSession`/`AuthProvider` (Task 3), `supabase`, `loginSchema`/`LoginValues`, `mapAuthError`, `queryClient`, gluestack `GluestackUIProvider` + primitives (Task 2), NativeWind.
- Produces: the auth-gated app (login → tabs). Terminal deliverable.

- [ ] **Step 1: Providers in the root layout**

Update `apps/mobile/app/_layout.tsx` to add React Query + Auth around the router (keep fonts/splash/Gluestack from Task 2):

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
import { GluestackUIProvider } from '../components/ui/gluestack-ui-provider';
import { AuthProvider } from '../lib/auth';
import { queryClient } from '../lib/query';
import '../global.css';

SplashScreen.preventAutoHideAsync();

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
    <GluestackUIProvider mode="dark">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </QueryClientProvider>
    </GluestackUIProvider>
  );
}
```

Delete `apps/mobile/app/index.tsx` (routing is handled by the groups below; the `(app)` index becomes the home).

- [ ] **Step 2: UI wrappers (on-brand)**

`apps/mobile/components/ui/button.tsx` — a pressable primary button using NativeWind tokens (wrap gluestack's `Button` if its API is stable in the installed version; otherwise a `Pressable` is fine and equally on-brand):

```tsx
import { ActivityIndicator, Pressable, Text } from 'react-native';

export function Button({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      className={`h-12 items-center justify-center rounded-xl bg-primary px-4 ${disabled || loading ? 'opacity-60' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color="#04241b" />
      ) : (
        <Text className="font-medium text-base text-primary-foreground">{label}</Text>
      )}
    </Pressable>
  );
}
```

`apps/mobile/components/ui/text-field.tsx` — a labeled input with an error slot:

```tsx
import { Text, TextInput, View, type TextInputProps } from 'react-native';

export function TextField({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View className="gap-1">
      <Text className="text-sm text-foreground">{label}</Text>
      <TextInput
        aria-label={label}
        placeholderTextColor="#8a9a92"
        className="h-12 rounded-xl border border-input bg-card px-3 text-base text-foreground"
        {...props}
      />
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
    </View>
  );
}
```

(`aria-label={label}` maps to the input's accessibility label so the login tests' `getByLabelText('E-mail')`/`'Senha'` resolve deterministically.)

- [ ] **Step 3: Route-group layouts**

`apps/mobile/app/(auth)/_layout.tsx`:

```tsx
import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../lib/auth';

export default function AuthLayout() {
  const { session, loading } = useSession();
  if (loading) return null;
  if (session) return <Redirect href="/(app)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`apps/mobile/app/(app)/_layout.tsx`:

```tsx
import { Redirect, Tabs } from 'expo-router';
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
        tabBarStyle: { backgroundColor: '#141d19', borderTopColor: '#243029' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
      <Tabs.Screen name="planos" options={{ title: 'Planos' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
```

- [ ] **Step 4: Placeholder authenticated screens**

`apps/mobile/app/(app)/index.tsx`:

```tsx
import { Text, View } from 'react-native';

export default function Home() {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-background p-6">
      <Text className="font-heading text-2xl text-foreground">Olá!</Text>
      <Text className="text-center text-base text-muted-foreground">
        Seus planos alimentares aparecerão aqui em breve.
      </Text>
    </View>
  );
}
```

`apps/mobile/app/(app)/planos.tsx`:

```tsx
import { Text, View } from 'react-native';

export default function Planos() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-6">
      <Text className="text-center text-base text-muted-foreground">
        Em breve: seus planos alimentares.
      </Text>
    </View>
  );
}
```

`apps/mobile/app/(app)/perfil.tsx`:

```tsx
import { Text, View } from 'react-native';
import { useSession } from '../../lib/auth';
import { Button } from '../../components/ui/button';

export default function Perfil() {
  const { session, signOut } = useSession();
  return (
    <View className="flex-1 justify-between bg-background p-6">
      <View className="gap-1">
        <Text className="font-heading text-2xl text-foreground">Perfil</Text>
        <Text className="text-base text-muted-foreground">{session?.user.email ?? ''}</Text>
      </View>
      <Button label="Sair" onPress={signOut} />
    </View>
  );
}
```

- [ ] **Step 5: Write the failing login test**

Write `apps/mobile/app/(auth)/login.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const signInWithPassword = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: (a: unknown) => signInWithPassword(a) } },
}));

import Login from './login';

beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ error: null });
});

describe('Login screen', () => {
  it('shows validation messages for empty/invalid input', async () => {
    render(<Login />);
    fireEvent.press(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByText('Informe um e-mail válido.')).toBeTruthy();
    expect(screen.getByText('Informe sua senha.')).toBeTruthy();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with valid credentials', async () => {
    render(<Login />);
    fireEvent.changeText(screen.getByLabelText('E-mail'), 'a@x.com');
    fireEvent.changeText(screen.getByLabelText('Senha'), 'secret');
    fireEvent.press(screen.getByRole('button', { name: /entrar/i }));
    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@x.com', password: 'secret' }),
    );
  });

  it('shows a friendly error when sign-in fails', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<Login />);
    fireEvent.changeText(screen.getByLabelText('E-mail'), 'a@x.com');
    fireEvent.changeText(screen.getByLabelText('Senha'), 'wrong');
    fireEvent.press(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile test -- login`
Expected: FAIL — `./login` does not exist.

- [ ] **Step 7: Implement the login screen**

`apps/mobile/app/(auth)/login.tsx`:

```tsx
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';
import { loginSchema, type LoginValues } from '../../lib/validation/auth';
import { mapAuthError } from '../../lib/auth/errors';
import { Button } from '../../components/ui/button';
import { TextField } from '../../components/ui/text-field';

export default function Login() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    // On success the auth listener updates the session and (auth)/_layout redirects.
  }

  return (
    <ScrollView contentContainerClassName="flex-1 justify-center bg-background p-6" keyboardShouldPersistTaps="handled">
      <View className="gap-6">
        <View className="gap-1">
          <Text className="font-heading text-3xl text-primary">iNutri</Text>
          <Text className="font-heading-semibold text-xl text-foreground">Bem-vindo de volta</Text>
          <Text className="text-base text-muted-foreground">Entre na sua conta para continuar.</Text>
        </View>

        <View className="gap-4">
          <Controller
            control={control}
            name="email"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="E-mail"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="voce@email.com"
                error={errors.email?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Senha"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                autoComplete="password"
                placeholder="••••••••"
                error={errors.password?.message}
              />
            )}
          />

          {formError ? <Text className="text-sm text-destructive">{formError}</Text> : null}

          <Button label="Entrar" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
        </View>
      </View>
    </ScrollView>
  );
}
```

(`TextField`'s `label` becomes the field's accessibility label via the visible `<Text>`; the tests query `getByLabelText('E-mail')`/`'Senha'`. If RTL doesn't associate them, add `aria-label={label}` to the `TextInput` in `text-field.tsx` so `getByLabelText` resolves.)

- [ ] **Step 8: Run to verify login tests pass**

Run: `pnpm --filter @nutri-plus/mobile test -- login`
Expected: PASS (validation, sign-in, error).

- [ ] **Step 9: Full suite + typecheck + config**

Run: `pnpm --filter @nutri-plus/mobile test`
Expected: all suites green (smoke, theme, errors, validation, api, login).

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: exits 0.

Run: `pnpm --filter @nutri-plus/mobile exec expo config --type public > /dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): auth-gated navigation shell + login screen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `pnpm --filter @nutri-plus/mobile test` — all green.
- [ ] `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` — clean.
- [ ] `pnpm --filter @nutri-plus/mobile exec expo config --type public` — resolves (config + plugins valid).
- [ ] `pnpm install` from root is clean; `git status` shows no `node_modules`, `android/`, `ios/`, or `.expo/` staged.
- [ ] Confirm the web/api suites are untouched (this branch only adds `apps/mobile`): `pnpm --filter @nutri-plus/web test` and `pnpm --filter @nutri-plus/api test` still green.
- [ ] Manual smoke (device/simulator, not automated): `pnpm --filter @nutri-plus/mobile start`, open on a simulator; the login screen renders on-brand (teal, dark, Sora title); logging in with a real patient's credentials lands on the tabs; killing/reopening the app keeps the session (secure-store). **Watch the SecureStore 2KB-per-value limit** — if Supabase's session string triggers a SecureStore size warning/failure on a real device, follow up with a chunked storage adapter (out of scope for this foundation).
