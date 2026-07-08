# Mobile "Esqueci minha senha" (OTP reset) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a patient reset a forgotten password entirely inside the mobile app (Expo Go) via a 6-digit e-mail OTP: request a code, enter code + new password on one screen, and land in the app.

**Architecture:** Two new screens in the existing `app/(auth)` Expo Router group. `forgot-password` calls `supabase.auth.resetPasswordForEmail(email)` and navigates to `reset-password`, which does `verifyOtp({ type: 'recovery' })` then `updateUser({ password })` and navigates into `(app)`. The `(auth)/_layout` redirect is adjusted so the recovery session created by `verifyOtp` does not bounce the user out of `reset-password` before the password is set. Validation and error mapping mirror the web.

**Tech Stack:** Expo SDK 54, expo-router 6 (typedRoutes on), @supabase/supabase-js (`detectSessionInUrl: false`, SecureStore adapter), react-hook-form + zod, NativeWind v4, jest-expo + @testing-library/react-native.

## Global Constraints

- Branch: `feat/mobile-forgot-password` (already created off `main`; spec committed as `203116a`). Commit only; do not push or open a PR unless asked.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **SINGLE quotes** in all new files. Match existing mobile conventions: **relative imports** (e.g. `../../lib/supabase`), reuse `Screen` / `TextField` / `Button`, pt-BR copy.
- Verify every task with **both**: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (expect no output, exit 0) and `pnpm --filter @nutri-plus/mobile test` (all suites green).
- **typedRoutes is on.** `.expo/types/router.d.ts` (gitignored) enumerates only existing routes, so navigating to a not-yet-generated route fails `tsc`. After creating a new file under `app/`, regenerate the route types before `tsc` by running (from `apps/mobile`): `rm -rf /tmp/expo-typegen && npx expo export -p ios --output-dir /tmp/expo-typegen` — expect it to end with `Exported: /tmp/expo-typegen` (exit 0); it rewrites `.expo/types/router.d.ts` and doubles as a full-bundle check. Tasks that reference only pre-existing routes (e.g. `/(app)`, `/login`) do not need it.
- **Password rules (mirror web):** password `min(8)` message `A senha deve ter ao menos 8 caracteres.`; `confirmPassword` mismatch message `As senhas não coincidem.` (path `confirmPassword`); code must match `/^\d{6}$/` message `Informe o código de 6 dígitos.`
- `mapAuthError` must keep current login behavior green (it maps by `message` today; extend to read `error.code` first, then fall back to the existing message matching).
- Do **NOT** reintroduce `node-linker=hoisted` anywhere. Never commit `.env`.
- The Supabase "Reset Password" e-mail template `{{ .Token }}` change is a **manual dashboard prerequisite** for real end-to-end testing only (done by the maintainer). All unit tests mock Supabase and do not depend on it.
- Navigation uses expo-router's imperative `router` (`import { router } from 'expo-router'`) so screens that only render in tests don't need a router context; `reset-password` also uses the `useLocalSearchParams` hook for the `email` param.

---

### Task 1: Validation schemas (forgot + reset)

**Files:**
- Modify: `apps/mobile/lib/validation/auth.ts`
- Test: `apps/mobile/lib/validation/auth.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces: `forgotPasswordSchema` (`{ email: string }`), `resetPasswordSchema` (`{ code: string; password: string; confirmPassword: string }`), types `ForgotPasswordValues`, `ResetPasswordValues`. Existing `loginSchema`/`LoginValues` unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `apps/mobile/lib/validation/auth.test.ts` (and update the import on line 1):

```ts
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from './auth';
```

```ts
describe('forgotPasswordSchema', () => {
  it('rejects an invalid email', () => {
    const r = forgotPasswordSchema.safeParse({ email: 'nope' });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain('Informe um e-mail válido.');
  });
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@x.com' }).success).toBe(true);
  });
});

describe('resetPasswordSchema', () => {
  const base = { code: '123456', password: 'password1', confirmPassword: 'password1' };
  it('rejects a code that is not 6 digits', () => {
    const r = resetPasswordSchema.safeParse({ ...base, code: '12a45' });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain('Informe o código de 6 dígitos.');
  });
  it('rejects a short password', () => {
    const r = resetPasswordSchema.safeParse({ ...base, password: 'short', confirmPassword: 'short' });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain('A senha deve ter ao menos 8 caracteres.');
  });
  it('rejects mismatched passwords', () => {
    const r = resetPasswordSchema.safeParse({ ...base, confirmPassword: 'password2' });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain('As senhas não coincidem.');
  });
  it('accepts a valid reset', () => {
    expect(resetPasswordSchema.safeParse(base).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/validation/auth.test.ts`
Expected: FAIL — `forgotPasswordSchema`/`resetPasswordSchema` are `undefined` (not exported yet).

- [ ] **Step 3: Add the schemas**

Append to `apps/mobile/lib/validation/auth.ts` (after the existing `loginSchema`/`LoginValues`):

```ts
export const forgotPasswordSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
});

export const resetPasswordSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, 'Informe o código de 6 dígitos.'),
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/validation/auth.test.ts`
Expected: PASS (all `loginSchema`/`forgotPasswordSchema`/`resetPasswordSchema` tests).

- [ ] **Step 5: Typecheck + full suite, then commit**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (expect no output) and `pnpm --filter @nutri-plus/mobile test` (all green).

```bash
git add apps/mobile/lib/validation/auth.ts apps/mobile/lib/validation/auth.test.ts
git commit -m "feat(mobile): forgot/reset password zod schemas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Extend `mapAuthError` (code-first + reset/OTP messages)

**Files:**
- Modify: `apps/mobile/lib/auth/errors.ts`
- Test: `apps/mobile/lib/auth/errors.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `mapAuthError(error: { code?: string; message?: string } | null | undefined): string` — now reads `error.code` first, then falls back to `message` substring matching. Existing login outputs preserved.

- [ ] **Step 1: Write the failing tests**

Append to `apps/mobile/lib/auth/errors.test.ts`:

```ts
describe('mapAuthError — reset/OTP', () => {
  it('maps Supabase error codes to pt-BR messages', () => {
    expect(mapAuthError({ code: 'otp_expired' })).toBe('Código inválido ou expirado. Peça um novo.');
    expect(mapAuthError({ code: 'weak_password' })).toBe('A senha é muito fraca. Use ao menos 8 caracteres.');
    expect(mapAuthError({ code: 'same_password' })).toBe('A nova senha deve ser diferente da atual.');
    expect(mapAuthError({ code: 'over_email_send_rate_limit' })).toBe(
      'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    );
  });
  it('maps an invalid/expired OTP by message when there is no code', () => {
    expect(mapAuthError({ message: 'Token has expired or is invalid' })).toBe(
      'Código inválido ou expirado. Peça um novo.',
    );
  });
  it('prefers code over message', () => {
    expect(mapAuthError({ code: 'invalid_credentials', message: 'whatever' })).toBe('E-mail ou senha inválidos.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/auth/errors.test.ts`
Expected: FAIL — codes fall through to the generic message (and `code` is not read yet).

- [ ] **Step 3: Rewrite `errors.ts`**

Replace the entire contents of `apps/mobile/lib/auth/errors.ts` with:

```ts
const GENERIC = 'Algo deu errado. Tente novamente.';

// Supabase auth errors carry a stable `code`; prefer it, then fall back to
// `message` substrings for errors that only set a message (keeps older login
// behavior working).
const CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha inválidos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  otp_expired: 'Código inválido ou expirado. Peça um novo.',
  weak_password: 'A senha é muito fraca. Use ao menos 8 caracteres.',
  same_password: 'A nova senha deve ser diferente da atual.',
  over_email_send_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
};

export function mapAuthError(error: { code?: string; message?: string } | null | undefined): string {
  const code = error?.code;
  if (code && CODE_MESSAGES[code]) {
    return CODE_MESSAGES[code];
  }

  const msg = error?.message?.toLowerCase() ?? '';
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar.';
  }
  if (msg.includes('otp') || msg.includes('token') || msg.includes('expired')) {
    return 'Código inválido ou expirado. Peça um novo.';
  }
  if (msg.includes('weak password') || msg.includes('password should be at least')) {
    return 'A senha é muito fraca. Use ao menos 8 caracteres.';
  }
  if (msg.includes('should be different') || msg.includes('different from the old')) {
    return 'A nova senha deve ser diferente da atual.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  }
  return GENERIC;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/mobile exec jest lib/auth/errors.test.ts`
Expected: PASS — new cases pass AND the two original cases (`Invalid login credentials` → `E-mail ou senha inválidos.`, `network boom`/`null` → generic) still pass.

- [ ] **Step 5: Typecheck + full suite, then commit**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` and `pnpm --filter @nutri-plus/mobile test`.

```bash
git add apps/mobile/lib/auth/errors.ts apps/mobile/lib/auth/errors.test.ts
git commit -m "feat(mobile): map reset/OTP auth error codes to pt-BR

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `(auth)` layout — keep the recovery session on the reset screen

**Files:**
- Modify: `apps/mobile/app/(auth)/_layout.tsx`
- Test: `apps/mobile/app/(auth)/_layout.test.tsx` (create)

**Interfaces:**
- Consumes: `useSession()` → `{ session, loading, signOut }` from `../../lib/auth`; `Redirect`, `Stack`, `useSegments` from `expo-router`.
- Produces: `AuthLayout` default export that redirects to `/(app)` only when a session exists **and** the current screen is not `reset-password`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/(auth)/_layout.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';

const mockRedirect = jest.fn();
let mockSegments: string[] = [];
let mockSessionState: { session: unknown; loading: boolean } = { session: null, loading: false };

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
  Stack: () => null,
  useSegments: () => mockSegments,
}));
jest.mock('../../lib/auth', () => ({
  useSession: () => mockSessionState,
}));

import AuthLayout from './_layout';

beforeEach(() => {
  mockRedirect.mockReset();
  mockSegments = ['(auth)', 'login'];
  mockSessionState = { session: null, loading: false };
});

describe('(auth) layout guard', () => {
  it('redirects to (app) when a session exists off the reset screen', async () => {
    mockSessionState = { session: { user: {} }, loading: false };
    mockSegments = ['(auth)', 'login'];
    await render(<AuthLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(app)');
  });

  it('does NOT redirect while on reset-password even with a session', async () => {
    mockSessionState = { session: { user: {} }, loading: false };
    mockSegments = ['(auth)', 'reset-password'];
    await render(<AuthLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('does not redirect when there is no session', async () => {
    await render(<AuthLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(auth\)/_layout.test.tsx"` (the parens are escaped because jest treats the path as a regex)
Expected: FAIL — the current layout redirects whenever a session exists (the reset-password case wrongly redirects), and it does not import `useSegments`.

- [ ] **Step 3: Update the layout**

Replace the entire contents of `apps/mobile/app/(auth)/_layout.tsx` with:

```tsx
import { Redirect, Stack, useSegments } from 'expo-router';
import { useSession } from '../../lib/auth';

export default function AuthLayout() {
  const { session, loading } = useSession();
  const segments = useSegments();
  // verifyOtp establishes a short-lived recovery session mid-flow on the
  // reset screen; do NOT bounce the user into (app) before they set the new
  // password. reset-password navigates to (app) itself once updateUser wins.
  const onResetScreen = segments[segments.length - 1] === 'reset-password';
  if (loading) return null;
  if (session && !onResetScreen) return <Redirect href="/(app)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(auth\)/_layout.test.tsx"`
Expected: PASS (all three cases).

- [ ] **Step 5: Typecheck + full suite, then commit**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` and `pnpm --filter @nutri-plus/mobile test`.

```bash
git add "apps/mobile/app/(auth)/_layout.tsx" "apps/mobile/app/(auth)/_layout.test.tsx"
git commit -m "feat(mobile): keep recovery session on the reset screen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `reset-password` screen (code + new password → into the app)

**Files:**
- Create: `apps/mobile/app/(auth)/reset-password.tsx`
- Test: `apps/mobile/app/(auth)/reset-password.test.tsx`

**Interfaces:**
- Consumes: `supabase` (`auth.verifyOtp`, `auth.updateUser`, `auth.resetPasswordForEmail`), `resetPasswordSchema`/`ResetPasswordValues`, `mapAuthError`, `Screen`, `TextField`, `Button`; `router`, `useLocalSearchParams` from `expo-router`.
- Produces: default-export `ResetPassword` route. Navigates `router.replace('/(app)')` on success. Only references the pre-existing `/(app)` route (no new-route regen needed for this task's own tsc).

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/app/(auth)/reset-password.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockVerifyOtp = jest.fn();
const mockUpdateUser = jest.fn();
const mockResetPasswordForEmail = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (a: unknown) => mockVerifyOtp(a),
      updateUser: (a: unknown) => mockUpdateUser(a),
      resetPasswordForEmail: (a: unknown) => mockResetPasswordForEmail(a),
    },
  },
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (h: unknown) => mockReplace(h), push: jest.fn() },
  useLocalSearchParams: () => ({ email: 'a@x.com' }),
}));

import ResetPassword from './reset-password';

beforeEach(() => {
  mockVerifyOtp.mockReset().mockResolvedValue({ error: null });
  mockUpdateUser.mockReset().mockResolvedValue({ error: null });
  mockResetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  mockReplace.mockReset();
});

async function fillValid() {
  await fireEvent.changeText(screen.getByLabelText('Código'), '123456');
  await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'password1');
  await fireEvent.changeText(screen.getByLabelText('Confirmar senha'), 'password1');
}

describe('Reset password screen', () => {
  it('renders the code and password fields', async () => {
    await render(<ResetPassword />);
    expect(screen.getByLabelText('Código')).toBeTruthy();
    expect(screen.getByLabelText('Nova senha')).toBeTruthy();
    expect(screen.getByLabelText('Confirmar senha')).toBeTruthy();
  });

  it('verifies the code, updates the password, and enters the app', async () => {
    await render(<ResetPassword />);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: /salvar e entrar/i }));
    await waitFor(() =>
      expect(mockVerifyOtp).toHaveBeenCalledWith({ email: 'a@x.com', token: '123456', type: 'recovery' }),
    );
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'password1' }));
    expect(mockReplace).toHaveBeenCalledWith('/(app)');
  });

  it('shows an error and does not update the password when the code is invalid', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { code: 'otp_expired', message: 'Token has expired or is invalid' } });
    await render(<ResetPassword />);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: /salvar e entrar/i }));
    expect(await screen.findByText('Código inválido ou expirado. Peça um novo.')).toBeTruthy();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows the zod message for non-matching passwords and calls no supabase', async () => {
    await render(<ResetPassword />);
    await fireEvent.changeText(screen.getByLabelText('Código'), '123456');
    await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'password1');
    await fireEvent.changeText(screen.getByLabelText('Confirmar senha'), 'password2');
    await fireEvent.press(screen.getByRole('button', { name: /salvar e entrar/i }));
    expect(await screen.findByText('As senhas não coincidem.')).toBeTruthy();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('shows the weak-password message when updateUser rejects it and stays', async () => {
    mockUpdateUser.mockResolvedValue({ error: { code: 'weak_password', message: 'weak' } });
    await render(<ResetPassword />);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: /salvar e entrar/i }));
    expect(await screen.findByText('A senha é muito fraca. Use ao menos 8 caracteres.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('resends the code when tapped', async () => {
    await render(<ResetPassword />);
    await fireEvent.press(screen.getByText('Reenviar código'));
    await waitFor(() => expect(mockResetPasswordForEmail).toHaveBeenCalledWith('a@x.com'));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(auth\)/reset-password.test.tsx"`
Expected: FAIL — `./reset-password` cannot be resolved (screen not created yet).

- [ ] **Step 3: Create the screen**

Create `apps/mobile/app/(auth)/reset-password.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';
import { resetPasswordSchema, type ResetPasswordValues } from '../../lib/validation/auth';
import { mapAuthError } from '../../lib/auth/errors';
import { Button } from '../../components/ui/button';
import { TextField } from '../../components/ui/text-field';
import { Screen } from '../../components/ui/screen';

const RESEND_COOLDOWN_SECONDS = 30;

export default function ResetPassword() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [formError, setFormError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { code: '', password: '', confirmPassword: '' },
  });

  // Tick the resend cooldown down to zero; cleared on unmount.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function onResend() {
    if (cooldown > 0 || !email) return;
    setFormError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function onSubmit(values: ResetPasswordValues) {
    setFormError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email ?? '',
      token: values.code,
      type: 'recovery',
    });
    if (verifyError) {
      setFormError('Código inválido ou expirado. Peça um novo.');
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: values.password });
    if (updateError) {
      setFormError(mapAuthError(updateError));
      return;
    }
    router.replace('/(app)');
  }

  return (
    <Screen contentContainerClassName="grow justify-center p-6">
      <View className="gap-8">
        <View className="gap-1">
          <Text className="font-heading-semibold text-2xl text-foreground">Defina uma nova senha</Text>
          <Text className="font-sans text-base text-muted-foreground">
            Enviamos um código para {email ?? 'seu e-mail'}. Digite o código e escolha uma nova senha.
          </Text>
        </View>

        <View className="gap-4">
          <Controller
            control={control}
            name="code"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Código"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="000000"
                error={errors.code?.message}
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
                label="Confirmar senha"
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

          <Button label="Salvar e entrar" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />

          <Text
            onPress={onResend}
            className={`text-center font-sans text-sm ${cooldown > 0 ? 'text-muted-foreground' : 'text-primary'}`}
          >
            {cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Reenviar código'}
          </Text>
        </View>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(auth\)/reset-password.test.tsx"`
Expected: PASS (all six cases).

- [ ] **Step 5: Typecheck + full suite, then commit**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (this screen navigates only to `/(app)`, already in the route types, so no regen needed) and `pnpm --filter @nutri-plus/mobile test`.

```bash
git add "apps/mobile/app/(auth)/reset-password.tsx" "apps/mobile/app/(auth)/reset-password.test.tsx"
git commit -m "feat(mobile): reset-password screen (verify OTP + set new password)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `forgot-password` screen (request the code)

**Files:**
- Create: `apps/mobile/app/(auth)/forgot-password.tsx`
- Test: `apps/mobile/app/(auth)/forgot-password.test.tsx`

**Interfaces:**
- Consumes: `supabase.auth.resetPasswordForEmail`, `forgotPasswordSchema`/`ForgotPasswordValues`, `mapAuthError`, `Screen`, `TextField`, `Button`; `router` from `expo-router`.
- Produces: default-export `ForgotPassword` route. On success navigates `router.push({ pathname: '/reset-password', params: { email } })` (requires `reset-password` route from Task 4 to be in the generated route types → regen in Step 5).

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/app/(auth)/forgot-password.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockResetPasswordForEmail = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: (e: unknown) => mockResetPasswordForEmail(e) } },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (h: unknown) => mockPush(h), replace: jest.fn() },
}));

import ForgotPassword from './forgot-password';

beforeEach(() => {
  mockResetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  mockPush.mockReset();
});

describe('Forgot password screen', () => {
  it('shows a validation message for an invalid email and calls no supabase', async () => {
    await render(<ForgotPassword />);
    await fireEvent.press(screen.getByRole('button', { name: /enviar código/i }));
    expect(await screen.findByText('Informe um e-mail válido.')).toBeTruthy();
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('sends the code and navigates to reset with the email', async () => {
    await render(<ForgotPassword />);
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'a@x.com');
    await fireEvent.press(screen.getByRole('button', { name: /enviar código/i }));
    await waitFor(() => expect(mockResetPasswordForEmail).toHaveBeenCalledWith('a@x.com'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reset-password', params: { email: 'a@x.com' } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(auth\)/forgot-password.test.tsx"`
Expected: FAIL — `./forgot-password` cannot be resolved.

- [ ] **Step 3: Create the screen**

Create `apps/mobile/app/(auth)/forgot-password.tsx`:

```tsx
import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';
import { forgotPasswordSchema, type ForgotPasswordValues } from '../../lib/validation/auth';
import { mapAuthError } from '../../lib/auth/errors';
import { Button } from '../../components/ui/button';
import { TextField } from '../../components/ui/text-field';
import { Screen } from '../../components/ui/screen';

export default function ForgotPassword() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    setFormError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(values.email);
    if (error) {
      setFormError(mapAuthError(error));
      return;
    }
    // No separate "verifique seu e-mail" screen: go straight to code entry. A
    // non-existent e-mail navigates identically (no code arrives), preserving
    // the no-enumeration posture.
    router.push({ pathname: '/reset-password', params: { email: values.email } });
  }

  return (
    <Screen contentContainerClassName="grow justify-center p-6">
      <View className="gap-8">
        <View className="gap-1">
          <Text className="font-heading-semibold text-2xl text-foreground">Esqueceu a senha?</Text>
          <Text className="font-sans text-base text-muted-foreground">
            Informe seu e-mail e enviaremos um código para redefinir.
          </Text>
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

          {formError ? <Text className="font-sans text-sm text-destructive">{formError}</Text> : null}

          <Button label="Enviar código" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />

          <Text onPress={() => router.push('/login')} className="text-center font-sans text-sm text-primary">
            Voltar para o login
          </Text>
        </View>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(auth\)/forgot-password.test.tsx"`
Expected: PASS (both cases).

- [ ] **Step 5: Regenerate route types (both new routes now exist), typecheck, full suite, commit**

Regenerate typed routes so `/reset-password` (referenced here) is known to `tsc`, and confirm the whole app still bundles. From `apps/mobile`:

Run: `rm -rf /tmp/expo-typegen && npx expo export -p ios --output-dir /tmp/expo-typegen`
Expected: ends with `Exported: /tmp/expo-typegen` (exit 0); `.expo/types/router.d.ts` now includes `/forgot-password` and `/reset-password`.

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (expect no output) and `pnpm --filter @nutri-plus/mobile test` (all green).

```bash
git add "apps/mobile/app/(auth)/forgot-password.tsx" "apps/mobile/app/(auth)/forgot-password.test.tsx"
git commit -m "feat(mobile): forgot-password screen (request reset code)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Login → "Esqueci minha senha" link

**Files:**
- Modify: `apps/mobile/app/(auth)/login.tsx`
- Modify: `apps/mobile/app/(auth)/login.test.tsx`
- Modify: `apps/mobile/__tests__/smoke.test.tsx`
- Modify: `apps/mobile/__tests__/theme.test.tsx`

**Interfaces:**
- Consumes: `router` from `expo-router` (new import in `login.tsx`).
- Produces: a "Esqueci minha senha" link below the "Entrar" button navigating to `/forgot-password`. (Because `login.tsx` now imports `expo-router`, the three test files that render `<Login />` must mock `expo-router`.)

- [ ] **Step 1: Update the existing tests (they will fail first)**

In `apps/mobile/app/(auth)/login.test.tsx`, add the expo-router mock and a link test. After the existing `jest.mock('../../lib/supabase', …)` block, add:

```tsx
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (h: unknown) => mockPush(h), replace: jest.fn() },
}));
```

Add `mockPush.mockReset();` inside the existing `beforeEach`, and add this test inside the `describe('Login screen', …)` block:

```tsx
  it('navigates to forgot-password from the link', async () => {
    await render(<Login />);
    await fireEvent.press(screen.getByText('Esqueci minha senha'));
    expect(mockPush).toHaveBeenCalledWith('/forgot-password');
  });
```

In BOTH `apps/mobile/__tests__/smoke.test.tsx` and `apps/mobile/__tests__/theme.test.tsx`, add this mock right after their existing `jest.mock('../lib/supabase', …)` block (these render `<Login />` but never tap the link, so a bare mock is enough):

```tsx
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(auth\)/login.test.tsx"`
Expected: FAIL — `getByText('Esqueci minha senha')` finds nothing (link not added yet).

- [ ] **Step 3: Add the link to `login.tsx`**

Add the import near the other imports in `apps/mobile/app/(auth)/login.tsx`:

```tsx
import { router } from 'expo-router';
```

Then add the link immediately after the `<Button label="Entrar" … />` line (still inside the `<View className="gap-4">`):

```tsx
          <Text
            onPress={() => router.push('/forgot-password')}
            className="text-center font-sans text-sm text-primary"
          >
            Esqueci minha senha
          </Text>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/mobile exec jest "app/\(auth\)/login.test.tsx" "__tests__/smoke.test.tsx" "__tests__/theme.test.tsx"`
Expected: PASS — the new link test passes and the existing login/smoke/theme tests still pass with the expo-router mock.

- [ ] **Step 5: Regenerate types, typecheck, full suite, final bundle check, commit**

`login.tsx` now navigates to `/forgot-password`; Task 5's regen already added it, but regenerate again to be safe and to confirm the complete flow bundles. From `apps/mobile`:

Run: `rm -rf /tmp/expo-typegen && npx expo export -p ios --output-dir /tmp/expo-typegen`
Expected: `Exported: /tmp/expo-typegen` (exit 0).

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (expect no output) and `pnpm --filter @nutri-plus/mobile test` (all suites green — expect the full mobile suite, now including forgot/reset/layout tests).

```bash
git add "apps/mobile/app/(auth)/login.tsx" "apps/mobile/app/(auth)/login.test.tsx" apps/mobile/__tests__/smoke.test.tsx apps/mobile/__tests__/theme.test.tsx
git commit -m "feat(mobile): add 'Esqueci minha senha' link to login

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Manual verification (after all tasks — requires the Supabase template change)

Not part of the automated suite; the maintainer runs this once the "Reset Password" e-mail template includes `{{ .Token }}`:
1. Start the app (`pnpm --filter @nutri-plus/mobile start -- --clear`), open in Expo Go (SDK 54).
2. On login, tap "Esqueci minha senha" → enter a real patient e-mail → "Enviar código".
3. Read the 6-digit code from the e-mail, enter it + a new password (≥8) + confirm → "Salvar e entrar" → should land in the app.
4. Sanity: a wrong code shows "Código inválido ou expirado. Peça um novo."; mismatched passwords show "As senhas não coincidem."; "Reenviar código" disables for ~30s.
