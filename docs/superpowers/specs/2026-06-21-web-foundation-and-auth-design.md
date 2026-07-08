# Web Foundation & Auth — Design

**Date:** 2026-06-21
**Status:** Approved (pending implementation plan)
**Scope:** First slice of the web client (`apps/web`): project scaffolding + login / signup / email-confirmation flow, ending on a stub authenticated landing page.

---

## 1. Goal

Stand up the web application and prove the end-to-end authentication loop against the existing NestJS API and Supabase. Two deliverables:

1. **Project structure** — a Next.js (App Router) app wired into the pnpm/Turbo monorepo, themed to the iNutri brand with Tailwind + shadcn/ui, with Supabase auth, a typed API client, and middleware route protection.
2. **Auth pages** — login, signup (nutritionist only), an email-confirmation ("check your inbox") screen, the confirmation callback handler, and a stub authenticated landing page that renders the signed-in user and a sign-out action.

The slice is "done" when a new nutritionist can: sign up → receive a confirmation email → click it → land authenticated on a page that shows their name and role (with their local profile created via the API), and can log out and back in.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Framework | **Next.js 15 (App Router)** + React 19 + TypeScript |
| Styling | **Tailwind CSS v4 + shadcn/ui**, brand-themed |
| Auth client | **Supabase JS via `@supabase/ssr`** (cookie-based sessions) |
| Self-registration roles | **NUTRITIONIST only** |
| Email confirmation | **Enabled** (Supabase "Confirm email") |
| Post-login destination | **Stub authenticated landing** (name + role + sign out) |
| Testing | **Vitest + Testing Library** (component/unit) |
| Page layout | **Split panel**, responsive (stacked on tablet/mobile) |

## 3. Non-goals (explicitly out of scope)

Real dashboard/app features; patient or employee self-signup; forgot-password / password reset; social / OAuth login; "resend confirmation email"; remember-me; i18n framework (copy is hardcoded pt-BR for now); dark mode; analytics; Playwright/browser e2e.

A "Esqueceu a senha?" link appears in the UI for visual completeness but is **inert/stubbed** in this slice.

---

## 4. Architecture

### 4.1 Monorepo wiring

- `apps/web` becomes a pnpm workspace package (`@nutri-plus/web`), picked up by the existing `apps/*` glob in `pnpm-workspace.yaml`.
- Turbo tasks (`dev`, `build`, `lint`, `test`) run for web alongside the API.
- Node 24 (repo `.nvmrc`).
- **Dev ports:** API stays on `3000`; web runs on **`3001`** (`next dev -p 3001`) to avoid the collision.

### 4.2 Directory structure (`apps/web`)

```
apps/web/
  src/
    app/
      layout.tsx                 # root: fonts, <Providers>, <Toaster>, html lang="pt-BR"
      globals.css                # tailwind v4 + brand theme tokens
      (auth)/
        layout.tsx               # split-panel AuthLayout (brand panel + form slot)
        login/page.tsx
        signup/page.tsx
        verify-email/page.tsx     # "check your inbox"
      (app)/
        layout.tsx               # protected shell
        page.tsx                  # stub authenticated landing
      auth/
        callback/route.ts         # GET: exchange confirmation code -> session -> sync -> redirect
    components/
      ui/                         # shadcn primitives (button, input, label, form, card, sonner)
      brand/logo.tsx              # iNutri logo (variant: full|icon, tone: color|reverse)
      auth/
        auth-layout.tsx           # split panel + responsive band
        login-form.tsx
        signup-form.tsx
    lib/
      supabase/
        client.ts                 # createBrowserClient
        server.ts                 # createServerClient (cookies from next/headers)
        middleware.ts             # updateSession() helper
      api/
        client.ts                 # typed fetch wrapper (attaches Bearer)
        auth.ts                    # syncUser(), getMe()
      auth/
        errors.ts                  # map Supabase auth errors -> friendly pt-BR messages
        route-rules.ts             # pure redirect-decision helper (unit-tested)
      validation/auth.ts           # zod schemas: loginSchema, signupSchema
      providers.tsx                # React Query provider (client component)
    middleware.ts                  # session refresh + route protection
  public/brand/                    # logo SVGs copied from docs/brand/logos
  .env.example
  components.json                  # shadcn config
  next.config.ts · tsconfig.json · vitest.config.ts · vitest.setup.ts
  package.json
```

### 4.3 Supabase integration (`@supabase/ssr`)

- **`client.ts`** — `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)` for client components.
- **`server.ts`** — `createServerClient(...)` bound to `cookies()` from `next/headers` (async in Next 15) for route handlers and server components.
- **`middleware.ts` helper** — `updateSession(request)` refreshes the Supabase session and returns a `NextResponse` carrying the rotated auth cookies.
- **`middleware.ts` (root)** — calls `updateSession`, then applies route rules (see 4.6). Matcher excludes `_next/static`, `_next/image`, favicon, and `public/` assets.

The `anon` key is public by design and safe to ship to the browser. The Supabase **service-role key must never** appear in the web app.

### 4.4 API client

- **`client.ts`** — a small typed `fetch` wrapper. Base URL = `NEXT_PUBLIC_API_URL` with `/v1` appended. Reads the Supabase access token (server client in RSC/route handlers, browser client on the client) and attaches `Authorization: Bearer <token>`. Throws a typed `ApiError` (status + parsed body) on non-2xx so callers can branch (e.g. `409` "not synced").
- **`auth.ts`** — `syncUser(role)` → `POST /v1/auth/sync-user`; `getMe()` → `GET /v1/auth/me`. Request/response types imported from **`@nutri-plus/shared-types`** (`SyncUserRequest`, `MeResponse`, `UserRole`). No type duplication.

### 4.5 API change required — CORS

The API currently does **not** enable CORS, so cross-origin browser calls from the web origin would be blocked. This slice adds to `apps/api/src/main.ts`:

```ts
app.enableCors({
  origin: process.env.WEB_ORIGIN ?? 'http://localhost:3001',
  credentials: true,
});
```

`WEB_ORIGIN` is added to the API config so deploy environments set their real web origin. This is the only API-side change in this slice.

### 4.6 Route protection (`middleware.ts`)

After `updateSession` refreshes the session, a **pure helper** (`lib/auth/route-rules.ts`, unit-tested) decides the redirect from `(isAuthenticated, pathname)`:

- Unauthenticated + requesting a protected route (`(app)` group, e.g. `/`) → redirect to `/login`.
- Authenticated + requesting `/login` or `/signup` → redirect to `/`.
- `/auth/callback` and `/verify-email` are always reachable.
- Otherwise pass through.

Server-side enforcement means no flash of protected content.

---

## 5. Auth flows

### 5.1 Signup (`/signup`) — nutritionist only

Form fields: **name, email, password, confirm password** (zod-validated; see 6).

1. `supabase.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: ${origin}/auth/callback } })`.
   - `data.name` populates `user_metadata.name`, which the API's JWT strategy reads to set the local user's name.
2. Because email confirmation is enabled, `signUp` returns **no active session** → redirect to **`/verify-email?email=...`**.
3. Errors (e.g. email already registered, weak password) map to inline pt-BR messages via `lib/auth/errors.ts`.

### 5.2 Verify email (`/verify-email`)

Static informational screen: "Enviamos um link de confirmação para **{email}**." No resend in this slice. Includes a link back to `/login`.

### 5.3 Confirmation callback (`/auth/callback`, GET route handler)

1. Read `code` from the query string.
2. `supabase.auth.exchangeCodeForSession(code)` (server client) → sets session cookies.
3. Call **`POST /v1/auth/sync-user { role: NUTRITIONIST }`** with the new access token. The endpoint is **idempotent** (creates the local profile if absent, updates basics if present), so re-entry is safe. Role is hardcoded `NUTRITIONIST` because the web only self-registers nutritionists.
4. On success → redirect to `/`. On failure (invalid/expired code, or sync error) → redirect to `/login?error=...` with a friendly message.

### 5.4 Login (`/login`)

Form fields: **email, password**.

1. `supabase.auth.signInWithPassword({ email, password })`.
2. Success → `router.push('/')` + `router.refresh()` (so middleware/server see the new session).
3. Error mapping: invalid credentials → "E-mail ou senha inválidos"; unconfirmed email (`email_not_confirmed`) → "Confirme seu e-mail antes de entrar."

Returning, already-confirmed users authenticate here and never touch `/auth/callback`.

### 5.5 Stub authenticated landing (`(app)/page.tsx`)

Server component: reads the session, calls `getMe()` server-side, renders "Bem-vindo, **{name}**" + role. If `getMe()` returns `409` (synced session but no local profile — an edge case), it triggers a one-shot `syncUser(NUTRITIONIST)` then re-fetches. A **Sign out** control (client component) calls `supabase.auth.signOut()` then redirects to `/login`.

### 5.6 Flow summary

```
SIGNUP:  /signup --signUp--> /verify-email --(email link)--> /auth/callback
                                                              | exchangeCodeForSession
                                                              | POST /v1/auth/sync-user {NUTRITIONIST}
                                                              v
                                                              /  (stub landing, GET /v1/auth/me)
LOGIN:   /login --signInWithPassword--> /  (stub landing)
SIGNOUT: signOut() --> /login
```

---

## 6. Forms & validation

- **`react-hook-form` + `zod`** via `@hookform/resolvers`, rendered with the shadcn `Form` primitives.
- **loginSchema:** `email` (valid email), `password` (non-empty).
- **signupSchema:** `name` (min 2), `email` (valid), `password` (min 8 — aligned with Supabase's default minimum; adjustable), `confirmPassword` (must equal `password` via `.refine`).
- Validation errors render inline beneath each field; the submit button shows a pending state during async calls.

---

## 7. UI / brand

- **Fonts:** `next/font/google` self-hosts **Sora** (headings) and **Plus Jakarta Sans** (body), exposed as CSS variables (`--font-sora`, `--font-jakarta`) and wired to Tailwind `font-heading` / `font-sans`. No runtime external font request.
- **Theme tokens** (`globals.css`, shadcn CSS-variable convention, light mode):
  - `--primary` = teal `#14BFA6` (primary actions / pill buttons), `--primary-foreground` = white.
  - deep green `#0A5C45` for the brand panel gradient and headings accent.
  - `--background` white; mint `#E7ECE9` as a soft surface; `--foreground` ink `#0F1714`; `--muted-foreground` `#5B6B64`; `--border` `#D8E2DD`.
  - `--destructive` from the brand's red accent (`#FF8A80` family).
  - Radius: inputs/cards ~`12px`; primary buttons fully rounded (pill, `999px`) per the brand board.
- **Logo:** `components/brand/logo.tsx` renders the inline iNutri SVG. Props: `variant` (`full` | `icon`), `tone` (`color` for light surfaces | `reverse`/white for the dark brand panel). Raw SVGs also copied to `public/brand/` for favicon/meta use.
- **AuthLayout (split panel):** left brand panel (deep-green→teal gradient, white reverse logo, headline + subline) + right form slot.
- **shadcn components used:** `button`, `input`, `label`, `form`, `card`, `sonner` (toast).

### 7.1 Responsive

- **Desktop ≥1024px (`lg:`):** full side-by-side split (~46% panel / ~54% form).
- **Tablet 768–1023px (`md:`):** panel collapses to a brand **band on top**; form centered below with a comfortable max-width.
- **Mobile <768px (base):** compact brand band; full-width form; ≥44–48px tap targets and pill button.

Implemented mobile-first with Tailwind breakpoints (base → `md:` → `lg:`).

---

## 8. Error handling

- **Form/validation:** inline field errors from zod (pt-BR messages).
- **Auth errors:** `lib/auth/errors.ts` maps Supabase error codes to friendly messages; surfaced inline on the form.
- **API/network errors:** `ApiError` from the client; transient/unexpected failures surface via a `sonner` toast; the callback route redirects to `/login?error=...` on failure rather than dead-ending.
- **Loading states:** submit buttons disable + show a spinner during async work.

---

## 9. Testing (Vitest + Testing Library)

**In scope (no external services; Supabase client and API client are mocked):**

- `validation/auth.ts` — schema accept/reject cases (incl. password mismatch).
- `lib/auth/errors.ts` — error-code → message mapping.
- `lib/auth/route-rules.ts` — every redirect branch in the protection matrix.
- `login-form.tsx` / `signup-form.tsx` — render, show validation errors, call the mocked Supabase method with correct args, render mapped error messages.

**Out of scope:** real browser e2e and live Supabase/email round-trips (email confirmation makes a fully in-app loop impractical here; covered by manual verification).

---

## 10. Configuration / env

`apps/web/.env.example` (real values in gitignored `.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:3000
```

API side adds `WEB_ORIGIN` (defaults to `http://localhost:3001`) for CORS.

---

## 11. Security considerations

- Only the Supabase **anon** key reaches the browser (safe); the service-role key stays server-only in the API.
- Sessions are **httpOnly cookies** managed by `@supabase/ssr`; middleware refreshes them; protection is enforced server-side (no protected-content flash).
- The web never mints or verifies tokens — it forwards the Supabase JWT; the API verifies it via JWKS (ES256), unchanged.
- `sync-user` is idempotent and the role is hardcoded `NUTRITIONIST` on the web path — the web cannot create privileged accounts. (The API independently rejects `EMPLOYEE` self-registration.)
- CORS is restricted to the configured web origin with credentials.

---

## 12. Future work (not this slice)

Forgot-password / reset; resend confirmation; patient signup (with referral-code linking) and employee invite acceptance; OAuth providers; the real authenticated dashboard + app shell; dark mode; i18n; aligning `@nutri-plus/shared-types`' `UserRole` with the API's `EMPLOYEE` value.
