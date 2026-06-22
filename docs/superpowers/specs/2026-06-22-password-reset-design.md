# Password Reset — Design

**Date:** 2026-06-22
**Status:** Approved (pending implementation plan)
**Scope:** Add the "forgot password" / reset flow to `apps/web`, activating the currently-inert "Esqueceu a senha?" link on the login page.
**Builds on:** `docs/superpowers/specs/2026-06-21-web-foundation-and-auth-design.md` (this flow was explicitly deferred there). Same stack: Next.js App Router + Supabase (`@supabase/ssr`) + shadcn + the split-panel `AuthLayout`. Branch `feat/web-foundation-auth` (PR #12).

---

## 1. Goal

A nutritionist who forgot their password can request a reset email, click the link, set a new password, and then log in with it. Done when: `/login` → "Esqueceu a senha?" → request email → click email link → set new password → land on `/login` with a success notice → log in with the new password.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Reset email landing | Reuse `/auth/callback` with a `?next=/reset-password` param (it already exchanges the PKCE `code` for a session) |
| Post-reset destination | **Sign out → `/login?reset=1`** (force a clean re-login with the new password) |
| Email enumeration | Neutral confirmation copy — never reveal whether an account exists |
| Layout | Both pages live in the `(auth)` route group → reuse the split-panel `AuthLayout` |
| Testing | Vitest + Testing Library (component/unit), mirroring the existing auth tests |

## 3. Flow

1. **Login** (`components/auth/login-form.tsx`): the inert "Esqueceu a senha?" `<span>` becomes `<Link href="/forgot-password">`. The page also shows a success notice when the URL has `?reset=1` ("Senha alterada. Entre com a nova senha.").
2. **`/forgot-password`**: email field → `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${window.location.origin}/auth/callback?next=/reset-password })`. On success, render a **neutral confirmation** state ("Se existe uma conta com esse e-mail, enviamos um link para redefinir a senha.") — shown regardless of whether the email exists. Link back to `/login`.
3. **Email link → `/auth/callback?code=…&next=/reset-password`**: the callback exchanges the `code` (establishing a recovery session), and — because `next` is present — redirects to `/reset-password` **without** calling `syncUser` (a reset is not a fresh signup). The `next` value is honored only if it is a safe internal path (starts with `/` and not `//`); otherwise it falls back to the signup behavior.
4. **`/reset-password`**: protected by the middleware (requires the session the callback just established). New password + confirm password → `supabase.auth.updateUser({ password })`. On success → `supabase.auth.signOut()` → redirect `/login?reset=1`.

```
/login --"Esqueceu a senha?"--> /forgot-password --resetPasswordForEmail-->
   (neutral "check your inbox") --(email link)--> /auth/callback?code&next=/reset-password
     --exchangeCodeForSession (no sync)--> /reset-password --updateUser--> signOut --> /login?reset=1
```

## 4. Architecture / files

**New:**
- `src/app/(auth)/forgot-password/page.tsx` — renders `ForgotPasswordForm`.
- `src/components/auth/forgot-password-form.tsx` — client: email form + neutral confirmation state.
- `src/app/(auth)/reset-password/page.tsx` — renders `ResetPasswordForm`.
- `src/components/auth/reset-password-form.tsx` — client: new-password + confirm form.

**Modified:**
- `src/app/auth/callback/route.ts` — read optional `next`; if it is a safe internal path, redirect there after the exchange and **skip** `syncUser`; otherwise keep the existing signup behavior (`syncUser(NUTRITIONIST)` → `/`). Exchange failures continue to redirect to `/login?error=…`.
- `src/lib/auth/route-rules.ts` — add `/forgot-password` to `PUBLIC_ROUTES`. `/reset-password` stays protected (a session — the recovery session — is required; direct access without one → `/login`).
- `src/lib/validation/auth.ts` — add `forgotPasswordSchema` (`{ email }`) and `resetPasswordSchema` (`{ password: min 8, confirmPassword: matches password }`, reusing the existing `.refine` pattern) + inferred types.
- `src/lib/auth/errors.ts` — add `same_password` → "A nova senha deve ser diferente da atual." (Supabase rejects reusing the current password).
- `src/components/auth/login-form.tsx` — wire the link to `/forgot-password`; render the `?reset=1` success notice.

## 5. Validation & error handling

- **Forgot:** zod email validation inline; submit always resolves to the neutral confirmation (Supabase returns success regardless, by design); network/unexpected errors surface inline via `mapAuthError`.
- **Reset:** `password` min 8 + `confirmPassword` must match (same rules as signup). `updateUser` errors map via `mapAuthError` (incl. the new `same_password`). An expired/invalid recovery link manifests at the callback exchange → `/login?error=…`; if a user reaches `/reset-password` without a valid session, the middleware already bounced them to `/login`.
- **Open-redirect guard:** the callback only honors `next` when it starts with `/` and not `//`.

## 6. Testing (Vitest + Testing Library)

- `validation/auth` — `forgotPasswordSchema` (valid/invalid email), `resetPasswordSchema` (match/mismatch, min-8).
- `auth/errors` — `same_password` → its message; unknown still falls back.
- `auth/route-rules` — `/forgot-password` reachable unauthenticated; `/reset-password` requires a session (unauth → `/login`).
- `auth/callback/route` — recovery branch: with `next=/reset-password`, exchange succeeds → redirect to `/reset-password` and `syncUser` **not** called; open-redirect guard: `next=//evil.com` is ignored (falls back to signup behavior).
- `forgot-password-form` — invalid email → `resetPasswordForEmail` not called; valid → called with a `redirectTo` containing `/auth/callback?next=/reset-password`, and the neutral confirmation renders.
- `reset-password-form` — password mismatch → `updateUser` not called; success → `updateUser({ password })` called, then `signOut`, then redirect to `/login?reset=1`.
- `login-form` — the forgot link points to `/forgot-password`; the `?reset=1` success notice renders.

## 7. Out of scope (YAGNI)

Rate-limit UI; an explicit "resend email" button (the forgot page itself re-requests); authenticated "change password" from a settings screen; recovery-email template customization in Supabase.

## 8. Configuration

No new env vars. The Supabase redirect allow-list already includes `http://localhost:3001/**` (covers `/auth/callback`), so the recovery link works once that is configured for the project (as documented for the auth slice).
