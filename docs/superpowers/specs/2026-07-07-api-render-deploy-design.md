# API Deploy on Render (Docker) — Design / Runbook

**Date:** 2026-07-07
**Status:** Approved (design)

## Goal

Deploy the NestJS API (`apps/api`) to Render as an always-on Docker web
service, connected to the existing Supabase Postgres, with migrations applied
automatically on each release.

## Context (verified)

- Monorepo: `pnpm@9.12.0` + Turbo, Node `>=20`. The API depends on
  `@nutri-plus/shared-types` (workspace package, built with `tsc`).
- `apps/api/src/main.ts` already binds `process.env.PORT ?? 3000` (Render
  injects `PORT`) — no code change needed for the port.
- Prisma **7** with the **`@prisma/adapter-pg` driver adapter**: the runtime
  connects via `new PrismaPg({ connectionString: DATABASE_URL })`, so there is
  **no query-engine binary** to ship → a slim Node image, no OpenSSL concerns.
- `prisma.config.ts` feeds `DATABASE_URL` to the Prisma **CLI**
  (`datasource: { url: process.env.DATABASE_URL ?? '' }`), so
  `prisma migrate deploy` works with only that env var set. `prisma generate`
  runs in `postinstall` and needs no DB.
- Env is zod-validated at boot (`validateEnv`), so the process fails fast if any
  required var is missing.
- Auth guards are global (`APP_GUARD`); the existing `@Public()` decorator
  (`IS_PUBLIC_KEY`) already lets a route bypass `SupabaseAuthGuard`.

## Plan (Render Starter, always-on)

### 1. Health endpoint

Add a tiny **version-neutral, public** route for Render's health check:
`apps/api/src/health/` — `HealthController` with
`@Controller({ path: 'health', version: VERSION_NEUTRAL })`, `@Public()`,
`@Get()` returning `{ status: 'ok' }`. Route = `GET /health` (no `/v1` prefix).
Wired via `HealthModule` in `AppModule`. Unit test mirrors existing spec style.

### 2. Dockerfile — `apps/api/Dockerfile` (build context = repo root)

Multi-stage, `node:20-bookworm-slim`, pnpm via corepack:

- **builder:** copy the workspace manifests + lockfile, then the sources;
  `pnpm install --frozen-lockfile --filter @nutri-plus/api...` (installs only the
  API + its workspace deps; `postinstall` generates the Prisma client); build
  `@nutri-plus/shared-types` then `@nutri-plus/api`.
- **runner:** non-root, copies `node_modules` (kept whole — includes the
  `prisma` CLI + pnpm, needed by the pre-deploy migration), `apps/api/dist`,
  `apps/api/src/generated/prisma`, `apps/api/prisma`, `apps/api/prisma.config.ts`,
  and the manifests. `WORKDIR /app/apps/api`; `CMD ["node", "dist/main.js"]`.

### 3. `.dockerignore` (repo root)

Exclude `node_modules`, all `dist`, `.git`, `.expo`, `.next`, test output, and
the `apps/web` / `apps/mobile` sources (their `package.json` files stay — pnpm
needs every workspace manifest to satisfy `--frozen-lockfile`).

### 4. `render.yaml` (Blueprint)

One Docker web service:
- `runtime: docker`, `dockerfilePath: apps/api/Dockerfile`,
  `dockerContext: .`, `plan: starter`.
- `region` co-located with the Supabase project.
- `healthCheckPath: /health`.
- `preDeployCommand: pnpm --filter @nutri-plus/api exec prisma migrate deploy`
  (runs once per release, before traffic switches — available on paid plans).
- `envVars` list the **keys** with `sync: false` (values entered in the
  dashboard as secrets; never committed).

### 5. Environment variables (set in the Render dashboard)

Required (zod-validated at boot):
- `DATABASE_URL` — **Supabase pooler (Supavisor), session mode** (see gotcha).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `WEB_ORIGIN` — the deployed web origin (placeholder until the web is deployed;
  drives CORS; the mobile app is unaffected since CORS is browser-only).

Optional (have defaults): `OPENAI_MODEL_SMART`, `OPENAI_MODEL_FAST`.
`PORT` is injected by Render automatically.

## The Supabase connection gotcha (most important)

Render's outbound network is **IPv4**. Supabase's **direct** database host
(`db.<ref>.supabase.co`) is **IPv6-only**. Using it → connections hang/fail.

Use the **Supabase pooler (Supavisor) in session mode** instead:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Session mode (port **5432**) behaves like a real connection — it supports
transactions, prepared statements, and `prisma migrate deploy` — which is what a
long-lived NestJS server needs. (Transaction mode on 6543 is for
serverless/short-lived clients and adds Prisma caveats; not used here.)

## Verification

- `pnpm --filter @nutri-plus/api test` stays green (plus the new `/health` spec).
- `docker build -f apps/api/Dockerfile -t nutri-api .` succeeds locally.
- After deploy: `GET /health` → `200 { "status": "ok" }`; an authenticated route
  returns data; Render's release log shows `prisma migrate deploy` applied.

## Global constraints

- SINGLE quotes in new files.
- Never commit `.env` or any secret; env values live only in the Render
  dashboard.
- Additive migrations only, on the shared dev DB (`migrate deploy`, never
  `migrate dev`, in the release step).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do not push/PR unless asked.
