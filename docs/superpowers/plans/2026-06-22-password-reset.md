# Password Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "forgot password" / reset flow to `apps/web`, activating the inert "Esqueceu a senha?" link on the login page.

**Architecture:** Two new pages in the `(auth)` route group (request reset, set new password) reusing the split-panel `AuthLayout`. The reset email routes through the existing `/auth/callback` (which exchanges the PKCE `code` for a session) via a `?next=/reset-password` param; the callback honors a safe internal `next` and skips profile sync for that case. Setting the new password calls `supabase.auth.updateUser`, then signs out and returns to `/login?reset=1`.

**Tech Stack:** Next.js 16 (App Router) + React 19, Supabase `@supabase/ssr`, shadcn/ui (`Form`/`Input`/`Button`), `react-hook-form` + `zod` (v3), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-22-password-reset-design.md`
**Branch:** `feat/web-foundation-auth` (working tree clean).

## Global Constraints

- **Quotes:** single quotes (repo standard) in all new/edited TS/TSX.
- **Copy:** pt-BR, hardcoded.
- **Reuse, don't reinvent:** the `@supabase/ssr` clients (`@/lib/supabase/{client,server}`), `AuthLayout`, the shadcn `Form`/`Input`/`Button` primitives, `mapAuthError` (`@/lib/auth/errors`), and the zod patterns already in `@/lib/validation/auth`.
- **Reset is NOT a signup:** on the callback's `next` (recovery) branch, do **not** call `syncUser`.
- **Post-reset:** on success → `supabase.auth.signOut()` → `router.push('/login?reset=1')`.
- **Open-redirect guard:** the callback honors `next` only when it starts with `/` and not `//`.
- **`/forgot-password` is public; `/reset-password` is protected** (requires the recovery session).
- **Commits** end with the trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Pinned versions** unchanged: zod `^3.23.8` (use v3 syntax: `z.string().email()`, `.min()`, `.refine()`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/validation/auth.ts` (modify) | + `forgotPasswordSchema`, `resetPasswordSchema` + inferred types |
| `src/lib/auth/errors.ts` (modify) | + `same_password` message |
| `src/lib/auth/route-rules.ts` (modify) | `/forgot-password` → public |
| `src/app/auth/callback/route.ts` (modify) | honor safe `next` (skip sync, redirect there) |
| `src/components/auth/forgot-password-form.tsx` (create) | request-reset form + neutral confirmation |
| `src/app/(auth)/forgot-password/page.tsx` (create) | renders `ForgotPasswordForm` |
| `src/components/auth/reset-password-form.tsx` (create) | set-new-password form |
| `src/app/(auth)/reset-password/page.tsx` (create) | renders `ResetPasswordForm` |
| `src/components/auth/login-form.tsx` (modify) | wire forgot link + `?reset=1` notice |
| `src/app/(auth)/login/page.tsx` (modify) | wrap `LoginForm` in `<Suspense>` (for `useSearchParams`) |

---

## Task 1: Pure helpers — schemas, error message, route rule

**Files:**
- Modify: `apps/web/src/lib/validation/auth.ts`
- Test: `apps/web/src/lib/validation/auth.test.ts`
- Modify: `apps/web/src/lib/auth/errors.ts`
- Test: `apps/web/src/lib/auth/errors.test.ts`
- Modify: `apps/web/src/lib/auth/route-rules.ts`
- Test: `apps/web/src/lib/auth/route-rules.test.ts`

**Interfaces:**
- Produces: `forgotPasswordSchema`, `resetPasswordSchema`, `ForgotPasswordValues`, `ResetPasswordValues` from `@/lib/validation/auth`; `mapAuthError` now maps `same_password`; `decideRedirect` treats `/forgot-password` as public.

- [ ] **Step 1: Add failing tests to `apps/web/src/lib/validation/auth.test.ts`** (append inside the file, after the existing `describe` blocks)

```ts
import { forgotPasswordSchema, resetPasswordSchema } from './auth';

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.com' }).success).toBe(true);
  });
  it('rejects an invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  const base = { password: 'supersecret', confirmPassword: 'supersecret' };
  it('accepts matching passwords of length >= 8', () => {
    expect(resetPasswordSchema.safeParse(base).success).toBe(true);
  });
  it('rejects a short password', () => {
    expect(
      resetPasswordSchema.safeParse({ password: 'short', confirmPassword: 'short' }).success,
    ).toBe(false);
  });
  it('rejects mismatched passwords', () => {
    expect(
      resetPasswordSchema.safeParse({ ...base, confirmPassword: 'different' }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- validation/auth`
Expected: FAIL (`forgotPasswordSchema`/`resetPasswordSchema` are not exported).

- [ ] **Step 3: Implement in `apps/web/src/lib/validation/auth.ts`** (append after the existing `signupSchema` / type exports)

```ts
export const forgotPasswordSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- validation/auth`
Expected: PASS (all schema tests).

- [ ] **Step 5: Add failing test to `apps/web/src/lib/auth/errors.test.ts`** (add inside the existing `describe('mapAuthError', …)`)

```ts
  it('maps same_password', () => {
    expect(mapAuthError({ code: 'same_password' })).toMatch(/diferente/i);
  });
```

- [ ] **Step 6: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- auth/errors`
Expected: FAIL (falls back to the generic message, which does not match `/diferente/i`).

- [ ] **Step 7: Implement in `apps/web/src/lib/auth/errors.ts`** (add the entry to the `MESSAGES` map)

```ts
  same_password: 'A nova senha deve ser diferente da atual.',
```

- [ ] **Step 8: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- auth/errors`
Expected: PASS.

- [ ] **Step 9: Add route-rules tests to `apps/web/src/lib/auth/route-rules.test.ts`** (add inside the existing `describe('decideRedirect', …)` — the first is a new requirement, the second characterizes existing protected behavior)

```ts
  it('lets unauthenticated users reach /forgot-password', () => {
    expect(decideRedirect(false, '/forgot-password')).toBeNull();
  });

  it('requires a session for /reset-password (unauthenticated → /login)', () => {
    expect(decideRedirect(false, '/reset-password')).toBe('/login');
  });
```

- [ ] **Step 10: Run, verify the forgot-password case fails**

Run: `pnpm --filter @nutri-plus/web test -- route-rules`
Expected: FAIL on "lets unauthenticated users reach /forgot-password" (currently returns `/login`). The `/reset-password` case already passes (it's protected by default).

- [ ] **Step 11: Implement in `apps/web/src/lib/auth/route-rules.ts`** (add `/forgot-password` to `PUBLIC_ROUTES`)

```ts
const PUBLIC_ROUTES = ['/login', '/signup', '/verify-email', '/auth/callback', '/forgot-password'];
```

- [ ] **Step 12: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- route-rules`
Expected: PASS (full matrix).

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/lib
git commit -m "feat(web): reset schemas + same_password message + forgot-password public route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Callback honors a safe `next` (recovery branch)

**Files:**
- Modify: `apps/web/src/app/auth/callback/route.ts`
- Test: `apps/web/src/app/auth/callback/route.test.ts`

**Interfaces:**
- Consumes: existing `createClient` (`@/lib/supabase/server`), `syncUser` (`@/lib/api/auth`), `UserRole`.
- Produces: `GET` now redirects to a safe internal `next` after a successful exchange **without** calling `syncUser`; falls back to the signup behavior otherwise.

- [ ] **Step 1: Add failing tests to `apps/web/src/app/auth/callback/route.test.ts`** (add inside the existing `describe('GET /auth/callback', …)`; the mocks for `exchangeCodeForSession`, `getSession`, `syncUser`, and the `req()` helper already exist)

```ts
  it('redirects to a safe `next` after exchange without syncing (recovery)', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const res = await GET(
      req('http://localhost:3001/auth/callback?code=abc&next=/reset-password'),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(syncUser).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3001/reset-password');
  });

  it('ignores an unsafe `next` (open-redirect guard) and falls back to signup sync', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    syncUser.mockResolvedValue({});

    const res = await GET(
      req('http://localhost:3001/auth/callback?code=abc&next=//evil.com'),
    );

    expect(syncUser).toHaveBeenCalledWith('tok', 'NUTRITIONIST');
    expect(res.headers.get('location')).toBe('http://localhost:3001/');
  });
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- callback/route`
Expected: FAIL — the recovery test currently still syncs and redirects to `/` (no `next` handling yet).

- [ ] **Step 3: Implement in `apps/web/src/app/auth/callback/route.ts`** (full file)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { UserRole } from '@nutri-plus/shared-types';
import { createClient } from '@/lib/supabase/server';
import { syncUser } from '@/lib/api/auth';

/** Only honor internal paths — never an absolute or protocol-relative URL. */
function isSafeNext(next: string): boolean {
  return next.startsWith('/') && !next.startsWith('//');
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  const loginError = (msg: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);

  if (!code) return loginError('Link de confirmação inválido.');

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return loginError('Não foi possível confirmar seu e-mail. Tente entrar.');

  // Recovery (or any internal next): land where `next` says, without syncing —
  // a password reset is not a fresh signup.
  if (next && isSafeNext(next)) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Signup confirmation: provision the local profile (idempotent), then land on /.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    try {
      await syncUser(session.access_token, UserRole.NUTRITIONIST);
    } catch {
      return loginError('Conta confirmada, mas houve um erro ao finalizar. Tente entrar.');
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- callback/route`
Expected: PASS — all callback tests (the original 4 + the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/auth/callback
git commit -m "feat(web): callback honors safe next param for password recovery

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Forgot-password form + page

**Files:**
- Create: `apps/web/src/components/auth/forgot-password-form.tsx`
- Test: `apps/web/src/components/auth/forgot-password-form.test.tsx`
- Create: `apps/web/src/app/(auth)/forgot-password/page.tsx`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/client`), `forgotPasswordSchema`/`ForgotPasswordValues`, `mapAuthError`, shadcn `Form`/`Input`/`Button`.
- Produces: `<ForgotPasswordForm />` from `@/components/auth/forgot-password-form`.

- [ ] **Step 1: Write the failing test `apps/web/src/components/auth/forgot-password-form.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const resetPasswordForEmail = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { resetPasswordForEmail } }),
}));

import { ForgotPasswordForm } from './forgot-password-form';

beforeEach(() => {
  resetPasswordForEmail.mockReset();
});

describe('ForgotPasswordForm', () => {
  it('does not submit an invalid email', async () => {
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'nope');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/e-mail válido/i)).toBeInTheDocument();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('requests the reset email with the callback redirect and shows a neutral confirmation', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@clinica.com');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledTimes(1));
    const [email, opts] = resetPasswordForEmail.mock.calls[0];
    expect(email).toBe('ana@clinica.com');
    expect(opts.redirectTo).toContain('/auth/callback?next=/reset-password');
    expect(screen.getByText(/se existe uma conta/i)).toBeInTheDocument();
  });

  it('shows a mapped error on failure', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { code: 'over_email_send_rate_limit' } });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@clinica.com');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/muitas tentativas/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- forgot-password-form`
Expected: FAIL (cannot find `./forgot-password-form`).

- [ ] **Step 3: Implement `apps/web/src/components/auth/forgot-password-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/validation/auth';
import { mapAuthError } from '@/lib/auth/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <h2 className="font-heading text-2xl font-bold text-foreground">Verifique seu e-mail</h2>
        <p className="text-sm text-muted-foreground">
          Se existe uma conta com esse e-mail, enviamos um link para redefinir a senha.
        </p>
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Voltar para o login
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-bold text-foreground">Esqueceu a senha?</h2>
        <p className="text-sm text-muted-foreground">
          Informe seu e-mail e enviaremos um link para redefinir.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="voce@clinica.com" {...field} />
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
            {form.formState.isSubmitting ? 'Enviando…' : 'Enviar link'}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Lembrou a senha?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Implement `apps/web/src/app/(auth)/forgot-password/page.tsx`**

```tsx
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- forgot-password-form`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/auth/forgot-password-form.tsx apps/web/src/components/auth/forgot-password-form.test.tsx "apps/web/src/app/(auth)/forgot-password"
git commit -m "feat(web): forgot-password request page + form

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Reset-password form + page

**Files:**
- Create: `apps/web/src/components/auth/reset-password-form.tsx`
- Test: `apps/web/src/components/auth/reset-password-form.test.tsx`
- Create: `apps/web/src/app/(auth)/reset-password/page.tsx`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/client`), `resetPasswordSchema`/`ResetPasswordValues`, `mapAuthError`, shadcn `Form`/`Input`/`Button`, `useRouter`.
- Produces: `<ResetPasswordForm />` from `@/components/auth/reset-password-form`.

- [ ] **Step 1: Write the failing test `apps/web/src/components/auth/reset-password-form.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const updateUser = vi.fn();
const signOut = vi.fn();
const push = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { updateUser, signOut } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { ResetPasswordForm } from './reset-password-form';

beforeEach(() => {
  updateUser.mockReset();
  signOut.mockReset();
  push.mockReset();
});

async function fill(pw: string, confirm: string) {
  await userEvent.type(screen.getByLabelText(/nova senha/i), pw);
  await userEvent.type(screen.getByLabelText(/confirmar senha/i), confirm);
}

describe('ResetPasswordForm', () => {
  it('rejects mismatched passwords', async () => {
    render(<ResetPasswordForm />);
    await fill('supersecret', 'different');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(await screen.findByText(/não coincidem/i)).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('updates the password, signs out, and returns to /login?reset=1', async () => {
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    render(<ResetPasswordForm />);
    await fill('supersecret', 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({ password: 'supersecret' }),
    );
    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/login?reset=1');
  });

  it('shows a mapped error and does not redirect on failure', async () => {
    updateUser.mockResolvedValue({ error: { code: 'same_password' } });
    render(<ResetPasswordForm />);
    await fill('supersecret', 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(await screen.findByText(/diferente da atual/i)).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- reset-password-form`
Expected: FAIL (cannot find `./reset-password-form`).

- [ ] **Step 3: Implement `apps/web/src/components/auth/reset-password-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/validation/auth';
import { mapAuthError } from '@/lib/auth/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

export function ResetPasswordForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  async function onSubmit(values: ResetPasswordValues) {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    await supabase.auth.signOut();
    router.push('/login?reset=1');
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-bold text-foreground">Defina uma nova senha</h2>
        <p className="text-sm text-muted-foreground">Escolha uma senha para acessar sua conta.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nova senha</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" placeholder="••••••••" {...field} />
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
                  <Input type="password" autoComplete="new-password" placeholder="••••••••" {...field} />
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
            {form.formState.isSubmitting ? 'Salvando…' : 'Salvar nova senha'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
```

- [ ] **Step 4: Implement `apps/web/src/app/(auth)/reset-password/page.tsx`**

```tsx
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- reset-password-form`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/auth/reset-password-form.tsx apps/web/src/components/auth/reset-password-form.test.tsx "apps/web/src/app/(auth)/reset-password"
git commit -m "feat(web): reset-password page + form (updateUser → signOut → /login?reset=1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire the login page (forgot link + reset notice)

**Files:**
- Modify: `apps/web/src/components/auth/login-form.tsx`
- Test: `apps/web/src/components/auth/login-form.test.tsx`
- Modify: `apps/web/src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `useSearchParams` (`next/navigation`), `Link` (already imported).
- Produces: the login page links to `/forgot-password` and shows a success notice when `?reset=1` is present.

- [ ] **Step 1: Update the test mock + add failing tests in `apps/web/src/components/auth/login-form.test.tsx`**

First, replace the `next/navigation` mock and add a mutable search-params holder near the top (the existing mock only returns `useRouter`):

```ts
let currentSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => currentSearchParams,
}));
```

In the existing `beforeEach`, reset it:

```ts
  currentSearchParams = new URLSearchParams();
```

Then add two tests inside the existing `describe('LoginForm', …)`:

```ts
  it('links to the forgot-password page', () => {
    render(<LoginForm />);
    expect(screen.getByRole('link', { name: /esqueceu a senha/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('shows a success notice when ?reset=1 is present', () => {
    currentSearchParams = new URLSearchParams('reset=1');
    render(<LoginForm />);
    expect(screen.getByText(/senha alterada/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- login-form`
Expected: FAIL — the link is currently an inert `<span>` (no `link` role), and there is no reset notice. (The pre-existing tests also now exercise `useSearchParams`, which the updated mock supplies.)

- [ ] **Step 3: Edit `apps/web/src/components/auth/login-form.tsx`**

Add `useSearchParams` to the `next/navigation` import:

```ts
import { useRouter, useSearchParams } from 'next/navigation';
```

Inside the component, after `const router = useRouter();`, read the flag:

```ts
  const searchParams = useSearchParams();
  const justReset = searchParams.get('reset') === '1';
```

Add the notice just inside the top wrapper, right after the heading block `</div>` and before `<Form …>` (within the outer `<div className="space-y-6">`):

```tsx
      {justReset && (
        <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
          Senha alterada. Entre com a nova senha.
        </p>
      )}
```

Replace the inert forgot-password `<span>` block:

```tsx
          <div className="flex justify-end">
            <span className="cursor-not-allowed text-sm font-medium text-primary/60" aria-disabled="true">
              Esqueceu a senha?
            </span>
          </div>
```

with a real link:

```tsx
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              Esqueceu a senha?
            </Link>
          </div>
```

- [ ] **Step 4: Wrap the login page in `<Suspense>` — `apps/web/src/app/(auth)/login/page.tsx`**

`useSearchParams()` requires a Suspense boundary during prerender. Full file:

```tsx
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- login-form`
Expected: PASS — the original login tests plus the link + reset-notice tests.

- [ ] **Step 6: Full verification**

Run:
```bash
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/web build
```
Expected: all tests pass; tsc clean; build succeeds with `/forgot-password` and `/reset-password` in the route table.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/auth/login-form.tsx apps/web/src/components/auth/login-form.test.tsx "apps/web/src/app/(auth)/login/page.tsx"
git commit -m "feat(web): wire forgot-password link + post-reset success notice on login

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Step 1: Full checks**

```bash
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/web build
```
Expected: all green; routes `/forgot-password` and `/reset-password` present.

- [ ] **Step 2: Manual end-to-end smoke (requires real Supabase + `.env.local`, recovery redirect URL allow-listed)**

1. `/login` → click "Esqueceu a senha?" → `/forgot-password`.
2. Submit your email → neutral confirmation appears.
3. Click the email link → `/auth/callback?next=/reset-password` → lands on `/reset-password`.
4. Set a new password → redirected to `/login?reset=1` with the "Senha alterada" notice.
5. Log in with the new password → lands on `/`.

---

## Notes for the implementer

- **Single quotes** everywhere (repo standard) — the `login-form.tsx` edits must stay single-quoted.
- The `(auth)` layout already renders the colored logo above the form, so the new pages inherit it — don't add another logo.
- `/reset-password` is reachable only with the recovery session the callback establishes; the middleware already redirects sessionless visits to `/login` (Task 1 documents this with a test). No extra guard needed in the page.
- Label disambiguation in the reset form: `/nova senha/i` matches "Nova senha" but not "Confirmar senha"; `/confirmar senha/i` matches the confirm field.
