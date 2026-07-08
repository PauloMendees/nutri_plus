# Mobile "Esqueci minha senha" (password reset via OTP) — Design

**Date:** 2026-07-02
**Status:** Approved (pending implementation plan)
**Scope:** Add a self-contained **forgot-password / reset-password** flow to the patient-facing mobile app (`apps/mobile`), using a **6-digit e-mail OTP** (no deep link) so it works entirely inside Expo Go. A patient who forgot their password requests a code, enters the code + a new password on one screen, and is taken straight into the app.
**Builds on:** the existing mobile auth foundation — Supabase client (`lib/supabase.ts`, `detectSessionInUrl: false`), `AuthProvider`/`useSession` (`lib/auth.tsx`), the `(auth)` route group with session redirects (`(auth)/_layout.tsx`), `loginSchema`/`mapAuthError`, and the shared UI (`Screen`, `Logo`, `TextField`, `Button`). Mirrors the web's reset copy and validation rules, but uses OTP instead of the web's magic-link + `/auth/callback` mechanism. New feature branch `feat/mobile-forgot-password` (branched from `main` after PR #24 merges).

---

## 1. Goal

A patient can recover access without support. Done when: the login screen has an "Esqueci minha senha" link; a forgot-password screen sends a recovery code to the e-mail (`resetPasswordForEmail`) and shows a neutral confirmation regardless of whether the account exists; a reset-password screen takes the 6-digit code + a new password (min 8, confirmed) and, on submit, verifies the code (`verifyOtp` type `recovery`) then sets the password (`updateUser`) and lands the user in the authenticated app; invalid/expired codes, weak/identical passwords, and rate-limits show friendly pt-BR messages; foundation tests pass; and none of this requires a deep link or a dev build (runs in Expo Go).

## 2. Context

- **Web reference (link-based, not reused verbatim):** `ForgotPasswordForm` calls `resetPasswordForEmail(email, { redirectTo: origin/auth/callback?next=/reset-password })`; the callback route exchanges the code for a session (`detectSessionInUrl`), then `ResetPasswordForm` calls `updateUser({ password })`, `signOut()`, and routes to `/login?reset=1`. This depends on a browser + URL detection — not available on mobile (`detectSessionInUrl: false`, deep links deferred and fragile in Expo Go).
- **Mobile auth:** `supabase` client with a SecureStore storage adapter; `AuthProvider` subscribes to `onAuthStateChange` and exposes `useSession()`. `(auth)/_layout` redirects to `(app)` whenever a session exists; `(app)/_layout` redirects to `/login` when there is none.
- **Shared UI:** `Screen` (keyboard-aware wrapper), `Logo` (`tone="dark"`), `TextField` (spreads `TextInputProps`, sets `aria-label={label}`, shows an `error` line), `Button` (`label`, `onPress`, `loading`).
- **Validation/errors to mirror:** web `forgotPasswordSchema` = `{ email }`; web `resetPasswordSchema` = `{ password: min 8 "A senha deve ter ao menos 8 caracteres.", confirmPassword }` refined "As senhas não coincidem." Web `mapAuthError` maps by Supabase error **`code`** (`invalid_credentials`, `weak_password`, `same_password`, `over_email_send_rate_limit`, …); mobile `mapAuthError` currently maps by **`message`** substring.
- **Patients have passwords:** patients accept a Supabase invite and set a password during first access, so a recovery code delivers to a real account.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Mechanism | **6-digit e-mail OTP** (`resetPasswordForEmail` → `verifyOtp` type `recovery` → `updateUser`). No deep link, no dev build. |
| Screen structure | **Two screens total:** (1) e-mail → send code; (2) **one combined screen** with code + new password + confirm (single submit does verify-then-update). |
| Post-reset | **Enter the app directly** — keep the recovery session; on success `router.replace('/(app)')`. No sign-out. |
| Account-existence privacy | Forgot screen always shows a neutral message; `resetPasswordForEmail` does not reveal whether the e-mail exists. |
| Resend | A "Reenviar código" action on the reset screen, disabled during a ~30s cooldown (avoids Supabase `over_email_send_rate_limit`). |
| Password rules | Mirror web: min 8 chars, `confirmPassword` must match. Code: exactly 6 digits, numeric. |
| Copy | pt-BR, mirroring web wording where it exists. |

## 4. Screens & navigation (`apps/mobile/app/(auth)`)

```
(auth)/
  _layout.tsx        # CHANGED: don't redirect away from `reset-password` even with a session
  login.tsx          # CHANGED: add "Esqueci minha senha" link → /forgot-password
  forgot-password.tsx  # NEW: e-mail → resetPasswordForEmail → /reset-password?email=…
  reset-password.tsx   # NEW: code + new password + confirm → verifyOtp → updateUser → /(app)
```

- **Login link:** below the "Entrar" button, a centered subtle link `Esqueci minha senha` (`text-primary`, `font-sans text-sm`) that does `router.push('/forgot-password')`.
- **forgot-password.tsx:** `Screen` + centered `Logo` optional (keep lighter than login — a heading is enough); heading "Esqueceu a senha?", subtitle "Informe seu e-mail e enviaremos um código para redefinir."; one `TextField` (e-mail, `keyboardType="email-address"`, `autoCapitalize="none"`); `Button` "Enviar código" (`loading` while submitting). On success → `router.push({ pathname: '/reset-password', params: { email } })` — there is **no separate "verifique seu e-mail" screen**; it navigates straight to the code-entry screen, whose subtitle ("Enviamos um código para {email}") is the confirmation. Because `resetPasswordForEmail` succeeds regardless of whether the account exists, a non-existent e-mail navigates identically (and simply no code arrives), which preserves the no-enumeration privacy posture. Below the form, a "Voltar para o login" link. A local inline error line only for unexpected failures (e.g. rate-limit).
- **reset-password.tsx:** reads `email` via `useLocalSearchParams`. Heading "Defina uma nova senha", subtitle "Enviamos um código para {email}. Digite o código e escolha uma nova senha." Fields: `TextField` **Código** (`keyboardType="number-pad"`, `maxLength={6}`, `autoComplete="one-time-code"`), `TextField` **Nova senha** (`secureTextEntry`, `autoComplete="new-password"`), `TextField` **Confirmar senha** (`secureTextEntry`). A "Reenviar código" text link (disabled + "Reenviar em {n}s" during cooldown). `Button` "Salvar e entrar". Inline `formError` line for non-field errors.

## 5. Auth mechanics (the delicate part)

- **Send:** `forgot-password` → `await supabase.auth.resetPasswordForEmail(email)`. Any error → inline pt-BR via `mapAuthError`; otherwise navigate to reset. (No `redirectTo` — mobile uses the OTP path.)
- **Verify + update (single submit on reset-password):**
  1. `const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' })` — establishes a recovery session. On error → set the inline `formError` line (same pattern as login) to "Código inválido ou expirado. Peça um novo." and **return** (do not call `updateUser`).
  2. `const { error: updateError } = await supabase.auth.updateUser({ password })` — sets the new password. On error → set `formError` via `mapAuthError` (weak/same password); the code already verified, so the user can fix just the password and resubmit (session persists).

  Both error cases surface on the single inline `formError` line above the button (zod field errors still render under their own fields), keeping the pattern identical to the login screen.
  3. On success → `router.replace('/(app)')`.
- **Redirect race — the key change:** `verifyOtp` sets a session, and `onAuthStateChange` updates `AuthProvider`, which would make `(auth)/_layout` redirect to `(app)` **between** steps 1 and 2, dropping the user into the app before the password is set. Fix in `(auth)/_layout.tsx`: read the current route with `useSegments()` and **suppress the session redirect while on `reset-password`**:

  ```tsx
  const segments = useSegments();
  const onReset = segments[segments.length - 1] === 'reset-password';
  if (loading) return null;
  if (session && !onReset) return <Redirect href="/(app)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
  ```

  The reset screen then explicitly navigates to `/(app)` after `updateUser` succeeds. `(app)/_layout` still guards on session, so a live session renders the app. (`forgot-password` never creates a session, so it is unaffected.)
- **Resend:** re-call `resetPasswordForEmail(email)`; start a 30s cooldown countdown (a `useState` seconds counter decremented by a `setInterval` in an effect, cleared on unmount). The link is disabled while `cooldown > 0`.

### External dependency (Supabase dashboard) — must be documented, not code

The Supabase **"Reset Password"** e-mail template must include the code token `{{ .Token }}` (today it only carries the magic link `{{ .ConfirmationURL }}` used by web). Adding `{{ .Token }}` is **additive and does not break the web** — the same e-mail then serves both the link (web) and the 6-digit code (mobile). This is a one-time change in the Supabase Auth → Email Templates panel, performed by the maintainer (no repo change). The plan will call this out as a prerequisite for manual end-to-end testing; unit tests mock Supabase and do not depend on it.

## 6. Validation & errors

- **`lib/validation/auth.ts`** (add, mirroring web):
  - `forgotPasswordSchema = z.object({ email: z.string().email('Informe um e-mail válido.') })`.
  - `resetPasswordSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Informe o código de 6 dígitos.'), password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.'), confirmPassword: z.string() }).refine(v => v.password === v.confirmPassword, { message: 'As senhas não coincidem.', path: ['confirmPassword'] })`.
  - Export `ForgotPasswordValues`, `ResetPasswordValues`.
- **`lib/auth/errors.ts`** — extend `mapAuthError` to check `error.code` first (aligning with web), then fall back to the existing `message` substring matching (so current login behavior/tests are preserved). New mappings:
  - invalid/expired OTP (`otp_expired`, or message includes `otp`/`token`/`expired`) → "Código inválido ou expirado. Peça um novo."
  - `weak_password` → "A senha é muito fraca. Use ao menos 8 caracteres."
  - `same_password` → "A nova senha deve ser diferente da atual."
  - `over_email_send_rate_limit` → "Muitas tentativas. Aguarde alguns minutos e tente de novo."
  - Existing login messages unchanged (`invalid_credentials`/invalid login → "E-mail ou senha inválidos.", `email_not_confirmed` → "Confirme seu e-mail antes de entrar.").

## 7. Components

No new components. Reuse `Screen`, `Logo`, `TextField` (code field uses `keyboardType="number-pad"` + `maxLength={6}`), `Button`. Both new screens use `<Screen contentContainerClassName="grow justify-center p-6">` for keyboard-aware centering, consistent with login.

## 8. Testing (`jest-expo` + `@testing-library/react-native`; Supabase mocked)

- **forgot-password:** invalid e-mail shows the zod message and does not call Supabase; a valid e-mail calls `resetPasswordForEmail` and navigates to `reset-password` with the `email` param (mock `expo-router`'s `router`/`useRouter`).
- **reset-password:**
  - valid code + matching password → calls `verifyOtp({ email, token, type: 'recovery' })` then `updateUser({ password })` and navigates (`router.replace('/(app)')`).
  - `verifyOtp` returns an error → shows "Código inválido ou expirado. Peça um novo." and **does not** call `updateUser`.
  - non-matching passwords → zod "As senhas não coincidem." (no Supabase call).
  - short password (<8) → zod min message.
  - `updateUser` returns `weak_password` → shows the weak-password message and stays on the screen.
- **`mapAuthError` unit:** new codes/messages → the pt-BR strings above; existing login cases still pass.
- **smoke:** reset-password renders Código / Nova senha / Confirmar senha fields (by label).

Testing pattern follows the existing login test: mock `../../lib/supabase`, use `getByLabelText`/`getByText`, `await` `render`/`fireEvent`. Mock `expo-router` for navigation assertions.

## 9. Out of scope

Magic-link / deep-link reset on mobile; changing the web reset flow; invite / first-access (already exists); logged-in "change password" inside Perfil (possible later slice); biometric unlock; e-mail template automation (the `{{ .Token }}` change is a manual dashboard step).
