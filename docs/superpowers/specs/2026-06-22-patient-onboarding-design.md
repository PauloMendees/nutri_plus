# Patient Onboarding (invite acceptance + set password) — Design

**Date:** 2026-06-22
**Status:** Approved (pending implementation plan)
**Scope:** When a nutritionist creates a patient, the patient is invited by email. This slice builds what receives that invite: the patient clicks the link, lands on a **set-password** screen, and after setting a password sees a **"baixe o app"** screen. Patients get **no access to the web app** (it is the nutritionist dashboard) — only the mobile app.
**Builds on:** the existing auth stack (`@supabase/ssr`, the `(auth)` split-panel layout, `reset-password-form`) and the existing patients API (`createPatient` → `inviteUser`). New branch `feat/patient-onboarding` off `main`.

---

## 1. Goal

Close the loop opened by the patients slice: an invited patient can accept the invite, set a password, and is told to use the mobile app. The web app refuses patients.

Done when:
- The invite email link lands the patient on **`/accept-invite`** with an active session.
- `/accept-invite` lets the patient set a password, then signs them out and sends them to **`/download-app`**.
- `/download-app` shows a branded "senha definida → baixe o iNutri" screen with **disabled App Store / Google Play badges marked "em breve"**.
- A `PATIENT` who reaches any `(app)` route is redirected to `/download-app` (the web is nutritionist-only).
- The API invite carries a `redirectTo` pointing at the web's `/accept-invite`.

## 2. Root cause being fixed

Admin-triggered invites (`inviteUserByEmail`) use Supabase's **implicit/hash flow** (`#access_token=…&type=invite`), not the PKCE `?code=` flow that `/auth/callback` handles. Today the invite passes **no `redirectTo`**, so the link falls back to the project **Site URL** with the token in the URL **fragment** — which is never sent to the server, so middleware sees no session and nothing consumes it. Result: the link "does nothing".

## 3. Locked decisions

| Decision | Choice |
|---|---|
| How the link establishes a session | **Approach B — implicit/hash flow consumed client-side.** Pass `redirectTo` → `/accept-invite`; the browser Supabase client (`detectSessionInUrl`, on by default) parses the hash on mount and persists the session to cookies. **No email-template change.** |
| Set-password UI | Reuse the existing `reset-password-form` pattern (`updateUser({ password })` → `signOut()`); reuse `resetPasswordSchema`. |
| Post-set-password | Redirect to a dedicated `/download-app` screen. |
| Download buttons | **Disabled App Store + Google Play badges marked "em breve"** (the mobile app is not published; `apps/mobile` exists but no store links yet). |
| Blocking patients from web | Role gate in `(app)/layout.tsx` using `me.role` it already fetches; `PATIENT` → redirect to `/download-app`. |
| Routes placement | Under the `(auth)` route group (reuse the split-panel `AuthLayout`); both are public. |
| Branch | `feat/patient-onboarding` off `main` (independent of the unmerged `feat/patients-ui`). |

**Approach A (rejected for now):** `token_hash` + a `/auth/confirm` server route calling `verifyOtp`. More correct (server-set cookies) but requires rewriting the existing custom invite email template to use `{{ .TokenHash }}` and adds a server route. Approach B reaches the same end state (session in cookies via the ssr browser client) with fewer moving parts and no template change.

## 4. API change (`apps/api`)

- **`env.schema.ts`:** add `WEB_ORIGIN: z.string().url()` (e.g. `http://localhost:3001`). Required, no default — a missing/invalid value should fail validation at boot.
- **`SupabaseAdminService.inviteUser`:** read `WEB_ORIGIN` from `ConfigService` (injected in the constructor) and pass `redirectTo: ${WEB_ORIGIN}/accept-invite` alongside the existing `data: { name }` to `inviteUserByEmail`. No other behavior changes (the 409/502 mapping and rollback stay as-is).

## 5. Web routes & pages

Both new routes live under `app/(auth)/` (reusing `AuthLayout`) and are **public** (added to `PUBLIC_ROUTES`).

### `/accept-invite` — client page (set password)
- Client component. On mount, the browser Supabase client (`createClient()`) auto-detects the session from the URL hash. The page subscribes to `onAuthStateChange` / checks `getSession()`:
  - **Session present** → render the set-password form.
  - **No session** (link expired/invalid/already used) → an error state: "Convite inválido ou expirado" + a link "Voltar ao login" (`/login`). Ask the nutritionist to resend if needed.
- Set-password form: `resetPasswordSchema` (password ≥ 8, confirm matches), shadcn `Form` + `PasswordInput`. On submit → `supabase.auth.updateUser({ password })`; on error → `mapAuthError`. On success → `supabase.auth.signOut()` → `router.push('/download-app')`.
- Copy: heading "Crie sua senha", subtext "Defina uma senha para concluir seu cadastro no iNutri." Button "Concluir cadastro" (pending: "Salvando…").

### `/download-app` — public page (download CTA)
- Server component (static). Centered card inside `AuthLayout`:
  - Success check + heading "Tudo pronto! 🎉" / "Senha criada com sucesso."
  - Body: "O iNutri para pacientes está no seu celular. Baixe o app para acessar seus planos, avaliações e acompanhamento."
  - Two **disabled** store badges (App Store, Google Play), each tagged "em breve" (same visual treatment as the bioimpedância "em breve" pattern).
- No live links this slice; reachable directly (e.g. a patient who already set a password and revisits).

## 6. Blocking patients from the web dashboard

- **New helper** `apps/web/src/lib/auth/access.ts`: `export function isWebDashboardRole(role: UserRole): boolean` → `role !== UserRole.PATIENT` (whitelist everyone except patients; future-proof if more roles are added).
- **`(app)/layout.tsx`:** after `me` is loaded, `if (me && !isWebDashboardRole(me.role)) redirect('/download-app')` (Next `redirect` from `next/navigation`). This is the backstop: even if a patient signs in at `/login`, they never see the dashboard. The `loadProfile` 409→`syncUser(NUTRITIONIST)` fallback is unaffected (an invited patient already has a local `PATIENT` profile, so `getMe` succeeds and never hits the fallback).

## 7. Route rules

- **`route-rules.ts`:** add `/accept-invite` and `/download-app` to `PUBLIC_ROUTES`. `AUTH_ONLY_REDIRECT` is unchanged (only `/login`, `/signup`), so an authenticated patient on `/accept-invite` is not bounced mid-flow.

## 8. Manual Supabase / env configuration (operator step — not code)

These must be set for the flow to work; they cannot be done in code and are documented here for the operator:
- **`apps/api/.env`:** `WEB_ORIGIN=http://localhost:3001` (the web origin; the API runs on `:3000`).
- **Supabase dashboard → Authentication → URL Configuration:**
  - **Redirect URLs** allowlist: add `http://localhost:3001/accept-invite` (and the production equivalent). Without this, Supabase **ignores `redirectTo`** and falls back to the Site URL — the current bug.
  - **Site URL:** set to the web origin (`http://localhost:3001`).

## 9. Error handling

- `/accept-invite` no-session → friendly "convite inválido ou expirado" state, not a crash.
- `updateUser` failure → inline message via `mapAuthError`.
- `signOut` is best-effort; navigation to `/download-app` proceeds regardless.

## 10. Testing (Vitest + Testing Library; API: Jest as existing)

- **API `supabase-admin.service.spec.ts`:** `inviteUser` calls `inviteUserByEmail` with `redirectTo` built from `WEB_ORIGIN` (+ existing `data.name`); mock `ConfigService` to provide `WEB_ORIGIN`. Existing 409/502/rollback cases still pass.
- **API `env.schema.spec.ts`:** a valid config with `WEB_ORIGIN` passes; a missing/invalid `WEB_ORIGIN` fails validation.
- **`route-rules.test.ts`:** `/accept-invite` and `/download-app` are public (no redirect when unauthenticated).
- **`access.test.ts`:** `isWebDashboardRole(NUTRITIONIST)` is `true`; `isWebDashboardRole(PATIENT)` is `false`.
- **`accept-invite` page/form:** with a mocked session present → renders the form; valid submit calls `updateUser` then `signOut` then routes to `/download-app`; with no session → renders the error state. (Mock the browser Supabase client.)
- **`download-app` page:** renders the headings and **disabled** store badges.

## 11. Out of scope (YAGNI / next slices)

- The mobile app itself and real store links (badges are "em breve").
- Approach A (`token_hash`/`verifyOtp` server route) and any email-template change.
- Resending invites from the nutritionist UI; invite-status tracking.
- Stamping role into Supabase `app_metadata` (the `(app)` layout gate via `me.role` is sufficient for web-only access; the API already authorizes by DB role).
- A patient-facing web area (patients use mobile only).
