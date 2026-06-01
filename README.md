# Nutri Plus

Nutrition SaaS monorepo (pnpm + Turborepo).

## Apps & packages
- `apps/api` — NestJS backend (Supabase JWT auth, Prisma/Postgres, v1 API).
- `apps/web` — web frontend (placeholder).
- `apps/mobile` — mobile app (placeholder).
- `packages/shared-types` — versioned API contracts.

## Prerequisites
- Node 24 (`.nvmrc`), pnpm via Corepack (`corepack enable`).
- Local PostgreSQL with databases `nutri_plus` and `nutri_plus_test`.

## Setup
```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env   # then fill in real values
pnpm --filter @nutri-plus/api db:migrate
```

## Common commands
```bash
pnpm --filter @nutri-plus/api dev        # run the API in watch mode
pnpm --filter @nutri-plus/api test       # unit tests
pnpm --filter @nutri-plus/api test:e2e   # e2e tests
pnpm build                               # build everything via turbo
```

## API
- `POST /v1/auth/sync-user` — create/update the local user from the Supabase JWT.
- `GET /v1/auth/me` — current user.
