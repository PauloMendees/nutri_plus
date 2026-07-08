# Mobile app foundation (Expo) + login — Design

**Date:** 2026-06-29
**Status:** Approved (pending implementation plan)
**Scope:** Bootstrap the **patient-facing mobile app** in `apps/mobile` with Expo, wiring everything the app will need (navigation, theme matching the web identity, auth via Supabase, API client, data layer, fonts) and delivering a working **login screen** + an auth-gated placeholder shell. The meal-plan feature and other patient functionality come in later slices.
**Builds on:** the existing pnpm/Turbo monorepo (`apps/web`, `apps/api`, `packages/shared-types`), the web's visual identity (Tailwind tokens, Sora + Plus Jakarta Sans), Supabase auth (`signInWithPassword`, same project as web), and the API (`{API_URL}/v1`, bearer token). New feature branch `feat/mobile-foundation`.

---

## 1. Goal

A patient can open the mobile app, log in with their e-mail + password (the credentials from their Supabase invite), and land in an authenticated app shell that looks like nutri_plus. Done when: `apps/mobile` is an Expo (Expo Router) app in the workspace; it uses NativeWind + gluestack-ui v2 themed with the web's palette (teal `#14bfa6`, dark theme, rounded) and Sora/Jakarta fonts; a login screen authenticates via Supabase and, on success, the app redirects to an authenticated tab shell with placeholder screens (Início / Planos / Perfil) and a working "Sair"; an unauthenticated launch shows login; the session persists across restarts; foundation tests pass.

## 2. Context

- `apps/mobile` is an empty placeholder (`.gitkeep` + README) in the pnpm workspace (`apps/*`).
- Web identity (from `apps/web/src/app/globals.css`): primary `#14bfa6`, dark bg `#0d1411`, card `#141d19`, foreground `#e7ece9`, `--radius: 0.75rem`, plus the full token set (secondary/muted/accent/destructive/border/input). Fonts: **Sora** (headings) + **Plus Jakarta Sans** (body).
- Web auth: Supabase `signInWithPassword({ email, password })`; login zod schema — `email: z.string().email('Informe um e-mail válido.')`, `password: z.string().min(1, 'Informe sua senha.')`; friendly errors via `mapAuthError`.
- Web API access: `${NEXT_PUBLIC_API_URL}/v1${path}` with `Authorization: Bearer <session.access_token>`. Patient-facing endpoints already exist (`GET /v1/me/meal-plans`) but are out of scope this phase.
- Patients receive a Supabase invite (server `createInvitedPatient`); they set a password during invite acceptance, so by the time they use the app they have login credentials. Mobile is **login-only** this phase (no signup/reset/first-access flow).

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Framework | **Expo (latest SDK) + Expo Router** (file-based routing; `(auth)` and `(app)` route groups). TypeScript. |
| UI | **NativeWind v4 + gluestack-ui v2**, themed with the web's shared palette (same token values) + dark mode; Sora/Jakarta via `@expo-google-fonts`. |
| Auth | **Supabase JS** (`@supabase/supabase-js`), same project as web, session persisted in **expo-secure-store** (encrypted). Login-only. |
| Data | **React Query** + a small `apiFetch` (`EXPO_PUBLIC_API_URL` + `/v1` + bearer token). Reuse `@nutri-plus/shared-types`. |
| Authenticated area | A **Tabs shell** (Início / Planos / Perfil) with **placeholder** screens + logout. No real features yet. |
| Scope boundary | Foundation + login + placeholder shell only. |

## 4. Project setup (`apps/mobile`)

- Expo app, workspace package `@nutri-plus/mobile` (matching `@nutri-plus/web`/`api`/`shared-types`), `app.config.ts` (name "iNutri", scheme `nutriplus`, icon/splash placeholders). Depends on `@nutri-plus/shared-types` (workspace).
- **Monorepo wiring:** `metro.config.js` made monorepo-aware (watch the workspace root; resolve hoisted `node_modules`; enable package-exports as needed for `@supabase`/shared-types). pnpm uses `node-linker=hoisted` (add `.npmrc` at repo root if not present) so Metro/Expo resolve dependencies. `babel.config.js` with `babel-preset-expo` + NativeWind's jsx transform; `nativewind` `global.css` + `tailwind.config.js`.
- **Scripts (package.json):** `start` = `expo start`, `ios`/`android`/`web` as usual, `typecheck` = `tsc --noEmit`, `test` = `jest` (jest-expo). Turbo: the mobile package participates in `test`/`lint`/`typecheck` (no `build` task — Expo apps aren't `turbo build`-compiled like the web).
- **Env:** `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Expo exposes `EXPO_PUBLIC_*` to the client). Ship a `.env.example`. The anon key is client-safe (same posture as web's `NEXT_PUBLIC_*`).

## 5. Theme (identity match)

- `theme/tokens.ts` (or `tailwind.config.js`) carries the SAME color values as the web (`primary #14bfa6`, `background`/`card`/`foreground`/`secondary`/`muted`/`accent`/`destructive`/`border`/`input`, radius `0.75rem`), for both light and dark, so NativeWind classes map to the web palette.
- gluestack-ui v2 config maps its component theme to these tokens (primary/background/etc.) so its Button/Input/etc. render on-brand.
- Fonts loaded with `useFonts` (Sora + Plus Jakarta Sans); a small `components/ui/text.tsx`/heading style applies Sora for headings, Jakarta for body — mirroring `font-heading`/body on the web.
- App defaults to the **dark** theme (matching the screenshots); a light theme is defined but toggling is out of scope this phase.

## 6. Structure & navigation (Expo Router)

```
app/
  _layout.tsx        # <QueryClientProvider><AuthProvider><GluestackUIProvider> + font/session bootstrap (keep splash until ready) + <Slot/>
  (auth)/
    _layout.tsx      # if session exists → redirect to (app)
    login.tsx        # login screen
  (app)/
    _layout.tsx      # if no session → redirect to /login ; else <Tabs> (Início/Planos/Perfil)
    index.tsx        # Início — placeholder ("Olá, {nome}" / em breve)
    planos.tsx       # Planos — placeholder (future meal plans)
    perfil.tsx       # Perfil — patient email + "Sair" (signOut)
lib/
  supabase.ts        # supabase client with SecureStore storage adapter
  auth.tsx           # AuthProvider + useSession() (session, loading, signOut) via onAuthStateChange
  api.ts             # apiFetch<T>(path, opts) → EXPO_PUBLIC_API_URL + /v1 + Bearer token
  query.ts           # QueryClient
components/ui/       # Button, Input, Text/Heading wrappers over gluestack, themed
```

## 7. Auth flow

- `lib/supabase.ts`: `createClient(url, anonKey, { auth: { storage: <SecureStore adapter>, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`. A tiny adapter implements `getItem/setItem/removeItem` over `expo-secure-store`.
- `lib/auth.tsx`: `AuthProvider` reads the initial session (`getSession`) and subscribes to `onAuthStateChange`; exposes `useSession()` → `{ session, user, loading, signOut }`. `signOut` = `supabase.auth.signOut()`.
- Root `_layout` shows the splash/`loading` state until fonts are loaded AND the initial session check resolves, then renders. Route-group layouts do the redirects (`Redirect` from expo-router) based on `session`.
- **Login screen** (`login.tsx`): a centered card — Sora title "Bem-vindo de volta", muted subtitle "Entre na sua conta para continuar."; `email` + `password` fields (react-hook-form + zod; mirror the web messages: "Informe um e-mail válido." / "Informe sua senha."); a full-width "Entrar" Button (disabled + spinner while submitting). On submit → `supabase.auth.signInWithPassword`; on error → an inline pt-BR message via a local `mapAuthError` (mirrors web: invalid-credentials → "E-mail ou senha inválidos.", generic fallback). On success the auth listener updates the session and the `(auth)` layout redirects to `(app)`.
- **API client** (`lib/api.ts`): `apiFetch<T>(path, { method, body })` resolves the token from `supabase.auth.getSession()`, sends `Authorization: Bearer <token>` + JSON content-type to `${EXPO_PUBLIC_API_URL}/v1${path}`, throws a typed `ApiError` on non-ok (mirrors web). Ready for the future `GET /me/meal-plans`; not called this phase.

## 8. Error handling / states

Login: field-level zod messages; auth failure → one inline error line (pt-BR), submit disabled while pending. Session bootstrap failure → the app still shows login (no crash). Missing env vars → a clear thrown error at startup (like web's `apiFetch`). Secure-store read errors are treated as "no session" (fall back to login).

## 9. Testing

`jest-expo` + `@testing-library/react-native` (foundation-level, keep light):
- **Login form validation:** submitting empty / invalid e-mail shows the zod messages; a valid form calls the (mocked) `signInWithPassword`.
- **Login error path:** `signInWithPassword` returning an error renders the friendly pt-BR message and does not navigate.
- **`mapAuthError`** unit: invalid-credentials → "E-mail ou senha inválidos."; unknown → generic fallback.
- (Supabase + secure-store are mocked; no real network/native calls.)

## 10. Out of scope (this phase)

The meal-plan feature and any `/me/*` data screens; signup / password-reset / invite-first-access (deep-link) flows; push notifications; offline/caching; in-app PDF; theme toggle; app-store build/config (EAS), deep links, and analytics. Authenticated screens are placeholders.
