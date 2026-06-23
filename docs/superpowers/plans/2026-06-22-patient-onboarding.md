# Patient Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an invited patient accept the invite, set a password, and be sent to a "baixe o app" screen — while blocking patients from the web dashboard.

**Architecture:** The API stamps a `redirectTo` (built from a new `WEB_ORIGIN` env var) onto the Supabase invite so the link lands on the web's `/accept-invite`. That client page lets the browser Supabase client consume the implicit-flow session from the URL hash, then reuses the reset-password pattern (`updateUser({ password })` → `signOut()`) and routes to `/download-app`. The `(app)` layout gains a role gate that redirects any `PATIENT` to `/download-app`.

**Tech Stack:** NestJS + Zod (api), Next.js App Router + `@supabase/ssr` + react-hook-form + zod + shadcn (web). API tests: Jest. Web tests: Vitest + Testing Library.

## Global Constraints

- **Single quotes** everywhere (repo standard).
- **pt-BR** for all user-facing copy.
- **Web tests:** Vitest + Testing Library (`*.test.tsx`). **API tests:** Jest (`*.spec.ts`).
- `WEB_ORIGIN` is a **required URL** env var on the API (no default).
- Invite redirect target is exactly **`${WEB_ORIGIN}/accept-invite`**.
- Web dashboard is allowed for every role **except `PATIENT`** (`UserRole` is `NUTRITIONIST | PATIENT`).
- New routes `/accept-invite` and `/download-app` are **public** and live under the `(auth)` route group (reuse `AuthLayout`).
- Reuse existing pieces: `resetPasswordSchema`, `mapAuthError`, `PasswordInput`, shadcn `Form`, `Logo`. Do **not** modify the working reset-password flow.
- Branch: `feat/patient-onboarding` (already created off `main`; spec already committed).

**Test commands** (run from repo root):
- API single file: `pnpm --filter @nutri-plus/api exec jest <path>`
- API all: `pnpm --filter @nutri-plus/api test`
- Web single file: `pnpm --filter @nutri-plus/web exec vitest run <path>`
- Web all: `pnpm --filter @nutri-plus/web test`
- Web types: `pnpm --filter @nutri-plus/web exec tsc --noEmit`

---

## File Structure

**API (`apps/api`)**
- Modify `src/config/env.schema.ts` — add `WEB_ORIGIN` to the schema.
- Modify `src/config/env.schema.spec.ts` — add `WEB_ORIGIN` to the valid fixture + cases.
- Modify `src/supabase/supabase-admin.service.ts` — read `WEB_ORIGIN`; pass `redirectTo` on invite.
- Modify `src/supabase/supabase-admin.service.spec.ts` — config mock provides `WEB_ORIGIN`; assert `redirectTo`.

**Web (`apps/web`)**
- Modify `src/lib/auth/route-rules.ts` — add the two public routes.
- Modify `src/lib/auth/route-rules.test.ts` — assert they are public.
- Create `src/lib/auth/access.ts` — `isWebDashboardRole`.
- Create `src/lib/auth/access.test.ts` — its unit tests.
- Modify `src/app/(app)/layout.tsx` — gate `PATIENT` → `/download-app`.
- Create `src/app/(auth)/download-app/page.tsx` — the download screen.
- Create `src/app/(auth)/download-app/page.test.tsx` — its test.
- Create `src/components/auth/accept-invite.tsx` — session detection + set-password form.
- Create `src/components/auth/accept-invite.test.tsx` — its tests.
- Create `src/app/(auth)/accept-invite/page.tsx` — renders `<AcceptInvite />`.

---

## Task 1: API — `WEB_ORIGIN` env + `redirectTo` on invite

**Files:**
- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/src/config/env.schema.spec.ts`
- Modify: `apps/api/src/supabase/supabase-admin.service.ts`
- Modify: `apps/api/src/supabase/supabase-admin.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService.getOrThrow<string>('WEB_ORIGIN')`.
- Produces: invites now call `inviteUserByEmail(email, { data: { name }, redirectTo: '${WEB_ORIGIN}/accept-invite' })`. No signature change to `inviteUser(email, { name })`.

- [ ] **Step 1: Update the env spec's valid fixture and add `WEB_ORIGIN` cases (failing test)**

In `apps/api/src/config/env.schema.spec.ts`, add `WEB_ORIGIN` to the `valid` fixture and two cases:

```ts
  const valid = {
    DATABASE_URL: 'postgresql://postgres:1234@localhost:5432/nutri_plus?schema=public',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    WEB_ORIGIN: 'https://app.test',
    OPENAI_API_KEY: 'sk-test',
  };
```

Add these two `it` blocks inside the `describe`:

```ts
  it('throws when WEB_ORIGIN is missing', () => {
    const { WEB_ORIGIN, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/WEB_ORIGIN/);
  });

  it('throws when WEB_ORIGIN is not a valid url', () => {
    expect(() => validateEnv({ ...valid, WEB_ORIGIN: 'localhost:3001' })).toThrow(
      /WEB_ORIGIN/,
    );
  });
```

- [ ] **Step 2: Run the env tests to verify they fail**

Run: `pnpm --filter @nutri-plus/api exec jest src/config/env.schema.spec.ts`
Expected: FAIL — the "missing"/"invalid" cases fail because `WEB_ORIGIN` isn't in the schema yet (and the valid fixture now carries an unknown key tolerated by Zod, so the new cases are the ones that fail).

- [ ] **Step 3: Add `WEB_ORIGIN` to the env schema**

In `apps/api/src/config/env.schema.ts`, add the field (place it right after `SUPABASE_SERVICE_ROLE_KEY`):

```ts
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  WEB_ORIGIN: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL_SMART: z.string().min(1).default('gpt-4o'),
  OPENAI_MODEL_FAST: z.string().min(1).default('gpt-4o-mini'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});
```

- [ ] **Step 4: Run the env tests to verify they pass**

Run: `pnpm --filter @nutri-plus/api exec jest src/config/env.schema.spec.ts`
Expected: PASS (all cases, including the original ones).

- [ ] **Step 5: Update the admin-service spec to provide `WEB_ORIGIN` and assert `redirectTo` (failing test)**

In `apps/api/src/supabase/supabase-admin.service.spec.ts`:

(a) Replace the `config` mock in `beforeEach` so it also returns `WEB_ORIGIN`:

```ts
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'SUPABASE_URL') return 'https://x.supabase.co';
        if (key === 'WEB_ORIGIN') return 'https://app.test';
        return 'service-role-key';
      },
    } as unknown as ConfigService;
```

(b) In the existing test `'returns the new user id and passes name as metadata'`, update the assertion to include `redirectTo`:

```ts
      expect(admin.inviteUserByEmail).toHaveBeenCalledWith('p@x.com', {
        data: { name: 'Pat' },
        redirectTo: 'https://app.test/accept-invite',
      });
```

(c) Add a focused test right after it:

```ts
    it('points the invite redirect at the web accept-invite route', async () => {
      admin.inviteUserByEmail.mockResolvedValue({
        data: { user: { id: 'sub-2' } },
        error: null,
      });

      await service.inviteUser('p@x.com', { name: 'Pat' });

      expect(admin.inviteUserByEmail).toHaveBeenCalledWith(
        'p@x.com',
        expect.objectContaining({ redirectTo: 'https://app.test/accept-invite' }),
      );
    });
```

- [ ] **Step 6: Run the admin-service tests to verify they fail**

Run: `pnpm --filter @nutri-plus/api exec jest src/supabase/supabase-admin.service.spec.ts`
Expected: FAIL — `inviteUserByEmail` is still called without `redirectTo`.

- [ ] **Step 7: Read `WEB_ORIGIN` in the service and pass `redirectTo`**

In `apps/api/src/supabase/supabase-admin.service.ts`:

(a) Add a private field and set it in the constructor:

```ts
@Injectable()
export class SupabaseAdminService {
  private readonly logger = new Logger(SupabaseAdminService.name);
  private readonly client: SupabaseClient;
  private readonly webOrigin: string;

  constructor(config: ConfigService) {
    this.client = createClient(
      config.getOrThrow<string>('SUPABASE_URL'),
      config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    this.webOrigin = config.getOrThrow<string>('WEB_ORIGIN');
  }
```

(b) Pass `redirectTo` in the `inviteUserByEmail` call:

```ts
      result = await this.client.auth.admin.inviteUserByEmail(email, {
        data: { name: meta.name },
        redirectTo: `${this.webOrigin}/accept-invite`,
      });
```

- [ ] **Step 8: Run the admin-service tests to verify they pass**

Run: `pnpm --filter @nutri-plus/api exec jest src/supabase/supabase-admin.service.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 9: Run the full API suite**

Run: `pnpm --filter @nutri-plus/api test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/config/env.schema.ts apps/api/src/config/env.schema.spec.ts apps/api/src/supabase/supabase-admin.service.ts apps/api/src/supabase/supabase-admin.service.spec.ts
git commit -m "feat(api): pass invite redirectTo from WEB_ORIGIN to /accept-invite

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Web — public routes + role gate

**Files:**
- Modify: `apps/web/src/lib/auth/route-rules.ts`
- Modify: `apps/web/src/lib/auth/route-rules.test.ts`
- Create: `apps/web/src/lib/auth/access.ts`
- Create: `apps/web/src/lib/auth/access.test.ts`
- Modify: `apps/web/src/app/(app)/layout.tsx`

**Interfaces:**
- Produces: `isWebDashboardRole(role: UserRole): boolean` from `@/lib/auth/access` — `true` for every role except `UserRole.PATIENT`.
- `/accept-invite` and `/download-app` are public (no redirect when unauthenticated).

- [ ] **Step 1: Add the public-route assertions (failing test)**

In `apps/web/src/lib/auth/route-rules.test.ts`, add inside the `describe`:

```ts
  it('lets unauthenticated users reach the patient onboarding routes', () => {
    expect(decideRedirect(false, '/accept-invite')).toBeNull();
    expect(decideRedirect(false, '/download-app')).toBeNull();
  });
```

- [ ] **Step 2: Run route-rules tests to verify the new case fails**

Run: `pnpm --filter @nutri-plus/web exec vitest run src/lib/auth/route-rules.test.ts`
Expected: FAIL — both currently redirect to `/login`.

- [ ] **Step 3: Add the routes to `PUBLIC_ROUTES`**

In `apps/web/src/lib/auth/route-rules.ts`, replace the `PUBLIC_ROUTES` line:

```ts
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/verify-email',
  '/auth/callback',
  '/forgot-password',
  '/accept-invite',
  '/download-app',
];
```

- [ ] **Step 4: Run route-rules tests to verify they pass**

Run: `pnpm --filter @nutri-plus/web exec vitest run src/lib/auth/route-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the `isWebDashboardRole` test (failing test)**

Create `apps/web/src/lib/auth/access.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { UserRole } from '@nutri-plus/shared-types';
import { isWebDashboardRole } from './access';

describe('isWebDashboardRole', () => {
  it('allows nutritionists in the web dashboard', () => {
    expect(isWebDashboardRole(UserRole.NUTRITIONIST)).toBe(true);
  });

  it('blocks patients from the web dashboard', () => {
    expect(isWebDashboardRole(UserRole.PATIENT)).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @nutri-plus/web exec vitest run src/lib/auth/access.test.ts`
Expected: FAIL — `./access` does not exist.

- [ ] **Step 7: Implement `access.ts`**

Create `apps/web/src/lib/auth/access.ts`:

```ts
import { UserRole } from '@nutri-plus/shared-types';

/** Roles allowed in the web dashboard. Patients use the mobile app only. */
export function isWebDashboardRole(role: UserRole): boolean {
  return role !== UserRole.PATIENT;
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm --filter @nutri-plus/web exec vitest run src/lib/auth/access.test.ts`
Expected: PASS.

- [ ] **Step 9: Gate patients in the `(app)` layout**

In `apps/web/src/app/(app)/layout.tsx`, add two imports and the gate. The imports (add near the existing imports):

```ts
import { redirect } from 'next/navigation';
import { isWebDashboardRole } from '@/lib/auth/access';
```

Then, inside `AppLayout`, immediately after the `const me = …` line, add the gate:

```ts
  const me = session?.access_token ? await loadProfile(session.access_token) : null;

  if (me && !isWebDashboardRole(me.role)) {
    redirect('/download-app');
  }
```

(Leave the rest of the layout unchanged.)

- [ ] **Step 10: Verify the web build/types still pass**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/lib/auth/route-rules.ts apps/web/src/lib/auth/route-rules.test.ts apps/web/src/lib/auth/access.ts apps/web/src/lib/auth/access.test.ts "apps/web/src/app/(app)/layout.tsx"
git commit -m "feat(web): public onboarding routes + block patients from the dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Web — `/download-app` screen

**Files:**
- Create: `apps/web/src/app/(auth)/download-app/page.tsx`
- Create: `apps/web/src/app/(auth)/download-app/page.test.tsx`

**Interfaces:**
- Produces: a default-exported `DownloadAppPage` server component at route `/download-app` showing the success copy + two disabled "em breve" store badges. (`/accept-invite` redirects here.)

- [ ] **Step 1: Write the page test (failing test)**

Create `apps/web/src/app/(auth)/download-app/page.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DownloadAppPage from './page';

describe('DownloadAppPage', () => {
  it('renders the success heading and disabled store badges', () => {
    render(<DownloadAppPage />);
    expect(screen.getByText(/tudo pronto/i)).toBeInTheDocument();
    expect(screen.getByText('App Store')).toBeInTheDocument();
    expect(screen.getByText('Google Play')).toBeInTheDocument();
    expect(screen.getAllByText(/em breve/i)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nutri-plus/web exec vitest run "src/app/(auth)/download-app/page.test.tsx"`
Expected: FAIL — `./page` does not exist.

- [ ] **Step 3: Implement the page**

Create `apps/web/src/app/(auth)/download-app/page.tsx`:

```tsx
import { Logo } from '@/components/brand/logo';

const STORES = [
  { name: 'App Store', sub: 'Baixar na' },
  { name: 'Google Play', sub: 'Disponível no' },
] as const;

export default function DownloadAppPage() {
  return (
    <div className="space-y-6 text-center">
      <Logo variant="icon" className="mx-auto h-12" />

      <div className="space-y-2">
        <h2 className="font-heading text-2xl font-bold text-foreground">Tudo pronto! 🎉</h2>
        <p className="text-sm text-muted-foreground">
          Sua senha foi criada. O iNutri para pacientes fica no seu celular — baixe o app para
          acessar seus planos, avaliações e acompanhamento.
        </p>
      </div>

      <div className="space-y-3">
        {STORES.map((store) => (
          <div
            key={store.name}
            aria-disabled="true"
            className="flex cursor-not-allowed items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3 opacity-60"
          >
            <span className="text-left">
              <span className="block text-xs text-muted-foreground">{store.sub}</span>
              <span className="block text-sm font-semibold text-foreground">{store.name}</span>
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              em breve
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @nutri-plus/web exec vitest run "src/app/(auth)/download-app/page.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(auth)/download-app/page.tsx" "apps/web/src/app/(auth)/download-app/page.test.tsx"
git commit -m "feat(web): download-app screen with em-breve store badges

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Web — `/accept-invite` (session detection + set password)

**Files:**
- Create: `apps/web/src/components/auth/accept-invite.tsx`
- Create: `apps/web/src/components/auth/accept-invite.test.tsx`
- Create: `apps/web/src/app/(auth)/accept-invite/page.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/client` (browser client, auto-detects the invite session from the URL hash); `resetPasswordSchema`/`ResetPasswordValues` from `@/lib/validation/auth`; `mapAuthError`; `PasswordInput`; shadcn `Form`. Routes to `/download-app` on success.
- Produces: `AcceptInvite` component (named export) + a page at `/accept-invite`.

- [ ] **Step 1: Write the component tests (failing test)**

Create `apps/web/src/components/auth/accept-invite.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getSession = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const push = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession, updateUser, signOut } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { AcceptInvite } from './accept-invite';

beforeEach(() => {
  getSession.mockReset();
  updateUser.mockReset();
  signOut.mockReset();
  push.mockReset();
});

describe('AcceptInvite', () => {
  it('shows the invalid state when there is no invite session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<AcceptInvite />);
    expect(await screen.findByText(/convite inválido ou expirado/i)).toBeInTheDocument();
  });

  it('sets the password, signs out, and routes to /download-app', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'p1' } } } });
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    render(<AcceptInvite />);

    await userEvent.type(await screen.findByLabelText(/^senha$/i), 'supersecret');
    await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /concluir cadastro/i }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'supersecret' }));
    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/download-app');
  });

  it('shows a mapped error and does not redirect on failure', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'p1' } } } });
    updateUser.mockResolvedValue({ error: { code: 'same_password' } });
    render(<AcceptInvite />);

    await userEvent.type(await screen.findByLabelText(/^senha$/i), 'supersecret');
    await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /concluir cadastro/i }));

    expect(await screen.findByText(/diferente da atual/i)).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nutri-plus/web exec vitest run src/components/auth/accept-invite.test.tsx`
Expected: FAIL — `./accept-invite` does not exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/auth/accept-invite.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/validation/auth';
import { mapAuthError } from '@/lib/auth/errors';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

type Status = 'checking' | 'ready' | 'invalid';

export function AcceptInvite() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  useEffect(() => {
    // The browser client auto-detects the invite session from the URL hash
    // (#access_token…&type=invite). getSession() resolves after that settles.
    const supabase = createClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setStatus(data.session ? 'ready' : 'invalid');
    });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(values: ResetPasswordValues) {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    await supabase.auth.signOut();
    router.push('/download-app');
  }

  if (status === 'checking') {
    return <p className="text-sm text-muted-foreground">Validando seu convite…</p>;
  }

  if (status === 'invalid') {
    return (
      <div className="space-y-3">
        <h2 className="font-heading text-2xl font-bold text-foreground">
          Convite inválido ou expirado
        </h2>
        <p className="text-sm text-muted-foreground">
          Este link de convite não é mais válido. Peça ao seu nutricionista para reenviar o convite.
        </p>
        <Link
          href="/login"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-bold text-foreground">Crie sua senha</h2>
        <p className="text-sm text-muted-foreground">
          Defina uma senha para concluir seu cadastro no iNutri.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Senha</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirmar senha</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button
            type="submit"
            className="w-full rounded-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? 'Salvando…' : 'Concluir cadastro'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
```

- [ ] **Step 4: Run the component tests to verify they pass**

Run: `pnpm --filter @nutri-plus/web exec vitest run src/components/auth/accept-invite.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Create the page**

Create `apps/web/src/app/(auth)/accept-invite/page.tsx`:

```tsx
import { AcceptInvite } from '@/components/auth/accept-invite';

export default function AcceptInvitePage() {
  return <AcceptInvite />;
}
```

- [ ] **Step 6: Verify types pass**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Run the full web suite**

Run: `pnpm --filter @nutri-plus/web test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/auth/accept-invite.tsx apps/web/src/components/auth/accept-invite.test.tsx "apps/web/src/app/(auth)/accept-invite/page.tsx"
git commit -m "feat(web): accept-invite page (consume invite session + set password)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Run the full API suite: `pnpm --filter @nutri-plus/api test` → PASS
- [ ] Run the full web suite: `pnpm --filter @nutri-plus/web test` → PASS
- [ ] Web types: `pnpm --filter @nutri-plus/web exec tsc --noEmit` → PASS
- [ ] Web build: `pnpm --filter @nutri-plus/web build` → succeeds
- [ ] Manual operator config reminder (not code): set `WEB_ORIGIN` in `apps/api/.env`; in the Supabase dashboard add `${WEB_ORIGIN}/accept-invite` to Redirect URLs and set Site URL to the web origin.
