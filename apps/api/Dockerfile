# ---------- builder ----------
# Node 24 (matches .nvmrc). Must be >=22 so @supabase/supabase-js finds a native
# global `WebSocket` — createClient's RealtimeClient constructor throws otherwise.
FROM node:24-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# openssl for Prisma's engine tooling; ca-certificates for TLS to Postgres.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# Workspace manifests first, so the dependency layer caches independently of the
# sources. `--frozen-lockfile` needs every workspace manifest present.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/shared-types/package.json ./packages/shared-types/
# The API's `postinstall` runs `prisma generate`, which reads the schema + config.
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/

# Install only the API and its workspace deps (skips web/mobile).
RUN pnpm install --frozen-lockfile --filter @nutri-plus/api...

# Sources, then build. Prisma 7 uses the pg driver adapter, so the generated
# client is TypeScript (no query-engine binary) and is compiled into dist by
# nest build — hence `prisma generate` MUST run before the build.
COPY . .
RUN pnpm --filter @nutri-plus/api exec prisma generate \
 && pnpm --filter @nutri-plus/shared-types build \
 && pnpm --filter @nutri-plus/api build

# ---------- runner ----------
FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# openssl for the pre-deploy `prisma migrate deploy`; ca-certificates for TLS to
# the Supabase pooler.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# Copy the whole built workspace so the pnpm symlink layout stays intact:
# node_modules (incl. the prisma CLI used by the pre-deploy `migrate deploy`),
# apps/api/dist (incl. the compiled generated client), packages/shared-types/dist,
# and apps/api/prisma + prisma.config.ts (used by migrate deploy).
COPY --from=builder /app ./

USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
