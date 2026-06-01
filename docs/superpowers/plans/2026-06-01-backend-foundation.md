# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Nutri Plus monorepo and a NestJS backend with Supabase JWT auth, Prisma/Postgres persistence, user synchronization, and `v1` API versioning — the "walking skeleton" every later feature builds on.

**Architecture:** pnpm + Turborepo monorepo. The `apps/api` NestJS service validates Supabase-issued JWTs (HS256 via `SUPABASE_JWT_SECRET`) using a Passport strategy, resolves/creates a local `User` (+ profile) on `POST /v1/auth/sync-user`, and exposes `GET /v1/auth/me`. Postgres is the developer's local instance, schema owned by Prisma. Controllers never touch Prisma directly — only services do. `apps/web` / `apps/mobile` are placeholders; `packages/shared-types` holds versioned API contracts.

**Tech Stack:** Node 24, pnpm (via Corepack), Turborepo, TypeScript, NestJS 10, Prisma 5 + PostgreSQL, `@nestjs/passport` + `passport-jwt`, `@nestjs/config` + Zod (env validation), Jest + Supertest, `jest-mock-extended`, `jsonwebtoken` (test token signing).

**Spec:** `docs/superpowers/specs/2026-06-01-backend-foundation-design.md`

---

## File Structure

```
nutri_plus/
├── package.json                    # root: workspaces, turbo scripts, packageManager
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json              # shared compiler options
├── .nvmrc
├── .gitignore                      # (exists)
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── nest-cli.json
│   │   ├── jest.config.ts          # unit tests
│   │   ├── test/
│   │   │   ├── jest-e2e.config.ts
│   │   │   ├── setup-e2e.ts        # truncate tables between tests
│   │   │   ├── helpers/sign-jwt.ts # sign Supabase-shaped JWTs for tests
│   │   │   └── auth.e2e-spec.ts
│   │   ├── .env.example
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── src/
│   │       ├── main.ts             # bootstrap + URI versioning (default '1')
│   │       ├── app.module.ts
│   │       ├── config/
│   │       │   ├── env.schema.ts   # Zod schema + validate()
│   │       │   └── env.schema.spec.ts
│   │       ├── prisma/
│   │       │   ├── prisma.service.ts
│   │       │   └── prisma.module.ts
│   │       ├── common/
│   │       │   ├── filters/all-exceptions.filter.ts
│   │       │   └── referral-code.ts
│   │       ├── users/
│   │       │   ├── users.service.ts
│   │       │   ├── users.service.spec.ts
│   │       │   └── users.module.ts
│   │       └── auth/
│   │           ├── types/auth-context.ts
│   │           ├── types/supabase-jwt-payload.ts
│   │           ├── strategies/supabase.strategy.ts
│   │           ├── guards/supabase-auth.guard.ts
│   │           ├── guards/roles.guard.ts
│   │           ├── decorators/public.decorator.ts
│   │           ├── decorators/roles.decorator.ts
│   │           ├── decorators/current-user.decorator.ts
│   │           ├── dto/sync-user.dto.ts
│   │           ├── auth.service.ts
│   │           ├── auth.service.spec.ts
│   │           ├── auth.controller.ts
│   │           └── auth.module.ts
│   ├── web/   { .gitkeep, README.md }     # placeholder
│   └── mobile/{ .gitkeep, README.md }     # placeholder
└── packages/
    └── shared-types/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts
            └── v1/
                ├── index.ts
                ├── user-role.ts        # UserRole enum
                └── auth.ts             # SyncUserRequest, MeResponse
```

`referral-code.ts` lives in `common/` because it's a pure utility consumed by `users.service.ts`. Files that change together (auth strategy, guards, decorators) live under `auth/`.

---

## Task 1: Root monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.nvmrc`
- Create: `apps/web/.gitkeep`, `apps/web/README.md`, `apps/mobile/.gitkeep`, `apps/mobile/README.md`
- Modify: `.gitignore` (already covers node_modules/dist/.env)

- [ ] **Step 1: Enable pnpm via Corepack**

Run:
```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate && pnpm -v
```
Expected: prints `9.12.0`.

- [ ] **Step 2: Create `.nvmrc`**

```
24
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Create root `package.json`**

```json
{
  "name": "nutri-plus",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "dev": "turbo run dev"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 5: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env", "apps/api/.env"],
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "dev": { "cache": false, "persistent": true }
  }
}
```

> `globalDependencies` lists `.env` files so Turbo invalidates its cache when env
> changes (relevant once `ConfigModule` lands in Task 4).

- [ ] **Step 6: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false,
    "resolveJsonModule": true
  }
}
```

> `useDefineForClassFields: false` is required: with `target: ES2022` it defaults
> to `true`, which breaks `class-validator` property decorators (used in the
> DTOs of Tasks 9–10). NestJS's own starter sets this explicitly.

- [ ] **Step 7: Create placeholders**

`apps/web/.gitkeep` → empty file. `apps/mobile/.gitkeep` → empty file.

`apps/web/README.md`:
```markdown
# web (placeholder)

Web frontend app. Not implemented in the backend-foundation sub-project.
```

`apps/mobile/README.md`:
```markdown
# mobile (placeholder)

Mobile app. Not implemented in the backend-foundation sub-project.
```

- [ ] **Step 8: Install and verify workspace resolves**

Run:
```bash
pnpm install
```
Expected: completes with no errors; creates `pnpm-lock.yaml`.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .nvmrc pnpm-lock.yaml apps/web apps/mobile
git commit -m "chore: scaffold pnpm + turborepo monorepo with app placeholders"
```

---

## Task 2: `packages/shared-types` (v1 contracts)

**Files:**
- Create: `packages/shared-types/package.json`, `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/index.ts`, `src/v1/index.ts`, `src/v1/user-role.ts`, `src/v1/auth.ts`

- [ ] **Step 1: Create `packages/shared-types/package.json`**

```json
{
  "name": "@nutri-plus/shared-types",
  "version": "0.0.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "echo \"no tests\" && exit 0",
    "lint": "echo \"no lint\" && exit 0"
  },
  "devDependencies": {
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Create `packages/shared-types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `src/v1/user-role.ts`**

```ts
export enum UserRole {
  NUTRITIONIST = 'NUTRITIONIST',
  PATIENT = 'PATIENT',
}
```

- [ ] **Step 4: Create `src/v1/auth.ts`**

```ts
import { UserRole } from './user-role';

export interface SyncUserRequest {
  role: UserRole;
  referralCode?: string;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  nutritionist?: { id: string; referralCode: string; crn: string | null };
  patient?: { id: string; nutritionistId: string | null };
}
```

- [ ] **Step 5: Create `src/v1/index.ts` and `src/index.ts`**

`src/v1/index.ts`:
```ts
export * from './user-role';
export * from './auth';
```

`src/index.ts`:
```ts
export * as v1 from './v1';
export * from './v1';
```

- [ ] **Step 6: Build the package**

Run:
```bash
pnpm --filter @nutri-plus/shared-types build
```
Expected: emits `packages/shared-types/dist/index.js` + `.d.ts`, no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types
git commit -m "feat(shared-types): add v1 UserRole and auth contracts"
```

---

## Task 3: `apps/api` NestJS scaffold + versioning

**Files:**
- Create: `apps/api/package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `jest.config.ts`
- Create: `apps/api/src/main.ts`, `src/app.module.ts`
- Create: `apps/api/src/app.module.spec.ts`

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@nutri-plus/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main.js",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "test": "jest --config jest.config.ts",
    "test:e2e": "jest --config test/jest-e2e.config.ts --runInBand",
    "prisma:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.4.0",
    "@nutri-plus/shared-types": "workspace:*",
    "@prisma/client": "^5.18.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.0",
    "@nestjs/schematics": "^10.1.3",
    "@nestjs/testing": "^10.4.0",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@types/passport-jwt": "^4.0.1",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "jest-mock-extended": "^3.0.7",
    "jsonwebtoken": "^9.0.2",
    "@types/jsonwebtoken": "^9.0.6",
    "pg": "^8.12.0",
    "@types/pg": "^8.11.6",
    "prisma": "^5.18.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.4",
    "ts-loader": "^9.5.1",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Create `apps/api/tsconfig.json` and `tsconfig.build.json`**

`tsconfig.json` (note: NO `rootDir` here — `include` covers `test/**/*`, and a
`rootDir: src` would make TypeScript emit TS6059 for files under `test/`):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "baseUrl": "."
  },
  "include": ["src/**/*", "test/**/*"]
}
```

`tsconfig.build.json` (`rootDir: src` lives here, where `test/` is excluded):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts"]
}
```

- [ ] **Step 3: Create `apps/api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

- [ ] **Step 4: Create `apps/api/jest.config.ts`**

```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
};

export default config;
```

- [ ] **Step 5: Create `apps/api/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common';

@Module({})
export class AppModule {}
```

- [ ] **Step 6: Create `apps/api/src/main.ts`**

```ts
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 7: Write the failing test `apps/api/src/app.module.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

describe('AppModule', () => {
  it('compiles', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    expect(moduleRef).toBeDefined();
  });
});
```

- [ ] **Step 8: Install deps and run the test to verify it passes**

Run:
```bash
pnpm install
pnpm --filter @nutri-plus/api test
```
Expected: 1 passing test (`AppModule compiles`). (The toolchain compiling + test passing is the verification here.)

- [ ] **Step 9: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): scaffold NestJS app with URI versioning (v1 default)"
```

---

## Task 4: Config module — Zod env validation

**Files:**
- Create: `apps/api/src/config/env.schema.ts`
- Test: `apps/api/src/config/env.schema.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing test `env.schema.spec.ts`**

```ts
import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://postgres:1234@localhost:5432/nutri_plus?schema=public',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_JWT_SECRET: 'secret',
    OPENAI_API_KEY: 'sk-test',
  };

  it('returns parsed config for valid env', () => {
    const result = validateEnv(valid);
    expect(result.DATABASE_URL).toBe(valid.DATABASE_URL);
  });

  it('throws when a required var is missing', () => {
    const { SUPABASE_JWT_SECRET, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/SUPABASE_JWT_SECRET/);
  });

  it('throws when DATABASE_URL is not a valid url', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'not-a-url' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/api test -- env.schema`
Expected: FAIL with "Cannot find module './env.schema'".

- [ ] **Step 3: Implement `env.schema.ts`**

```ts
import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nutri-plus/api test -- env.schema`
Expected: 3 passing tests.

- [ ] **Step 5: Wire `ConfigModule` into `app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
  ],
})
export class AppModule {}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/config apps/api/src/app.module.ts
git commit -m "feat(api): validate environment with Zod at boot"
```

---

## Task 5: Prisma setup + base schema + migration

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/prisma/prisma.service.ts`, `src/prisma/prisma.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/.env.example`

> Prerequisite: a local PostgreSQL server is running on `localhost:5432`
> (user `postgres`, password `1234`). The `createdb` CLI is **not** available on
> this machine, so databases are created without it:
> - `nutri_plus` (dev) is created automatically by `prisma migrate dev` in Step 4.
> - `nutri_plus_test` is created programmatically by the e2e setup (Task 11),
>   which connects to the `postgres` maintenance database via the `pg` driver and
>   issues `CREATE DATABASE` if it does not already exist.

- [ ] **Step 1: Create `apps/api/.env.example`**

```env
DATABASE_URL=postgresql://postgres:CHANGE_ME@localhost:5432/nutri_plus?schema=public
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_JWT_SECRET=your-jwt-secret
OPENAI_API_KEY=sk-placeholder-not-used-yet
PORT=3000
```

- [ ] **Step 2: Create the real `apps/api/.env` (gitignored, not committed)**

```env
DATABASE_URL=postgresql://postgres:1234@localhost:5432/nutri_plus?schema=public
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=dev-anon-key
SUPABASE_JWT_SECRET=dev-jwt-secret
OPENAI_API_KEY=sk-placeholder-not-used-yet
PORT=3000
```
Confirm `apps/api/.env` is ignored: `git check-ignore apps/api/.env` should print the path. (Root `.gitignore` already ignores `.env`.)

- [ ] **Step 3: Create `apps/api/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  NUTRITIONIST
  PATIENT
}

model User {
  id             String   @id @default(uuid())
  authProvider   String
  authProviderId String
  email          String   @unique
  name           String
  role           UserRole
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  nutritionistProfile NutritionistProfile?
  patientProfile      PatientProfile?

  @@unique([authProvider, authProviderId])
}

model NutritionistProfile {
  id           String   @id @default(uuid())
  userId       String   @unique
  user         User     @relation(fields: [userId], references: [id])
  crn          String?
  referralCode String   @unique
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  patients     PatientProfile[]
}

model PatientProfile {
  id             String   @id @default(uuid())
  userId         String   @unique
  user           User     @relation(fields: [userId], references: [id])
  nutritionistId String?
  nutritionist   NutritionistProfile? @relation(fields: [nutritionistId], references: [id])
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

- [ ] **Step 4: Generate client and create the migration**

Run:
```bash
cd apps/api && pnpm exec prisma migrate dev --name init && cd ../..
```
Expected: creates `apps/api/prisma/migrations/<timestamp>_init/migration.sql`, applies it to `nutri_plus`, and generates the Prisma Client. No errors.

- [ ] **Step 5: Create `apps/api/src/prisma/prisma.service.ts`**

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 6: Create `apps/api/src/prisma/prisma.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 7: Wire `PrismaModule` into `app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.schema';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 8: Verify build compiles with the generated client**

Run: `pnpm --filter @nutri-plus/api build`
Expected: `dist/` produced, no TS errors.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma apps/api/src/prisma apps/api/src/app.module.ts apps/api/.env.example
git commit -m "feat(api): add Prisma schema, client service, and init migration"
```

---

## Task 6: referralCode generator (pure util, TDD)

**Files:**
- Create: `apps/api/src/common/referral-code.ts`
- Test: `apps/api/src/common/referral-code.spec.ts`

- [ ] **Step 1: Write the failing test `referral-code.spec.ts`**

```ts
import { generateReferralCode } from './referral-code';

describe('generateReferralCode', () => {
  it('matches NUTRI-XXXXX format (5 Crockford base32 chars)', () => {
    const code = generateReferralCode();
    expect(code).toMatch(/^NUTRI-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/);
  });

  it('excludes ambiguous characters I, L, O, U', () => {
    for (let i = 0; i < 200; i++) {
      const body = generateReferralCode().slice('NUTRI-'.length);
      expect(body).not.toMatch(/[ILOU]/);
    }
  });

  it('produces varied codes (not constant)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateReferralCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/api test -- referral-code`
Expected: FAIL with "Cannot find module './referral-code'".

- [ ] **Step 3: Implement `referral-code.ts`**

```ts
import { randomInt } from 'crypto';

// Crockford base32 without ambiguous I, L, O, U.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateReferralCode(): string {
  let body = '';
  for (let i = 0; i < 5; i++) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `NUTRI-${body}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nutri-plus/api test -- referral-code`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/referral-code.ts apps/api/src/common/referral-code.spec.ts
git commit -m "feat(api): add referral code generator"
```

---

## Task 7: Auth primitives — strategy, guards, decorators

**Files:**
- Create: `apps/api/src/auth/types/supabase-jwt-payload.ts`, `src/auth/types/auth-context.ts`
- Create: `apps/api/src/auth/strategies/supabase.strategy.ts`
- Create: `apps/api/src/auth/guards/supabase-auth.guard.ts`, `src/auth/guards/roles.guard.ts`
- Create: `apps/api/src/auth/decorators/public.decorator.ts`, `roles.decorator.ts`, `current-user.decorator.ts`
- Test: `apps/api/src/auth/guards/roles.guard.spec.ts`

- [ ] **Step 1: Create `src/auth/types/supabase-jwt-payload.ts`**

```ts
export interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
  };
}
```

- [ ] **Step 2: Create `src/auth/types/auth-context.ts`**

```ts
import { NutritionistProfile, PatientProfile, User } from '@prisma/client';

export type LocalUser = User & {
  nutritionistProfile: NutritionistProfile | null;
  patientProfile: PatientProfile | null;
};

export interface AuthContext {
  authProviderId: string;
  email: string;
  name: string;
  user: LocalUser | null;
}
```

- [ ] **Step 3: Create `src/auth/strategies/supabase.strategy.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthContext } from '../types/auth-context';
import { SupabaseJwtPayload } from '../types/supabase-jwt-payload';

@Injectable()
export class SupabaseStrategy extends PassportStrategy(Strategy, 'supabase') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('SUPABASE_JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: SupabaseJwtPayload): Promise<AuthContext> {
    const authProviderId = payload.sub;
    const email = payload.email ?? '';
    const name =
      payload.user_metadata?.name ?? payload.user_metadata?.full_name ?? email;

    const user = await this.prisma.user.findUnique({
      where: {
        authProvider_authProviderId: { authProvider: 'SUPABASE', authProviderId },
      },
      include: { nutritionistProfile: true, patientProfile: true },
    });

    return { authProviderId, email, name, user };
  }
}
```

- [ ] **Step 4: Create the decorators**

`src/auth/decorators/public.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`src/auth/decorators/roles.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

`src/auth/decorators/current-user.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthContext } from '../types/auth-context';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthContext;
  },
);
```

- [ ] **Step 5: Create `src/auth/guards/supabase-auth.guard.ts`**

```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class SupabaseAuthGuard extends AuthGuard('supabase') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
```

- [ ] **Step 6: Write the failing test `src/auth/guards/roles.guard.spec.ts`**

```ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function ctxWith(user: unknown, handlerRoles: UserRole[] | undefined) {
  const reflector = {
    getAllAndOverride: () => handlerRoles,
  } as unknown as Reflector;
  const context = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { guard: new RolesGuard(reflector), context };
}

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    const { guard, context } = ctxWith({ user: null }, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows when local user role is in the required set', () => {
    const { guard, context } = ctxWith(
      { user: { role: UserRole.NUTRITIONIST } },
      [UserRole.NUTRITIONIST],
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies when local user is missing', () => {
    const { guard, context } = ctxWith({ user: null }, [UserRole.NUTRITIONIST]);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('denies when role does not match', () => {
    const { guard, context } = ctxWith(
      { user: { role: UserRole.PATIENT } },
      [UserRole.NUTRITIONIST],
    );
    expect(guard.canActivate(context)).toBe(false);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/api test -- roles.guard`
Expected: FAIL with "Cannot find module './roles.guard'".

- [ ] **Step 8: Implement `src/auth/guards/roles.guard.ts`**

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../types/auth-context';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const authCtx: AuthContext = request.user;
    return !!authCtx?.user && required.includes(authCtx.user.role);
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm --filter @nutri-plus/api test -- roles.guard`
Expected: 4 passing tests.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/auth/types apps/api/src/auth/strategies apps/api/src/auth/guards apps/api/src/auth/decorators
git commit -m "feat(api): add Supabase JWT strategy, auth/roles guards, and decorators"
```

---

## Task 8: UsersService (create user+profile, lookups)

**Files:**
- Create: `apps/api/src/users/users.service.ts`, `src/users/users.module.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

- [ ] **Step 1: Write the failing test `users.service.spec.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: UsersService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new UsersService(prisma);
  });

  it('creates a patient with a referral-linked nutritionist', async () => {
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ id: 'nutri-1' } as any);
    prisma.user.create.mockResolvedValue({ id: 'user-1' } as any);

    await service.createWithProfile({
      authProviderId: 'sub-1',
      email: 'p@x.com',
      name: 'Pat',
      role: UserRole.PATIENT,
      referralCode: 'NUTRI-ABCDE',
    });

    expect(prisma.nutritionistProfile.findUnique).toHaveBeenCalledWith({
      where: { referralCode: 'NUTRI-ABCDE' },
    });
    const createArg = prisma.user.create.mock.calls[0][0] as any;
    expect(createArg.data.role).toBe(UserRole.PATIENT);
    expect(createArg.data.patientProfile.create.nutritionistId).toBe('nutri-1');
  });

  it('rejects an unknown referral code', async () => {
    prisma.nutritionistProfile.findUnique.mockResolvedValue(null);

    await expect(
      service.createWithProfile({
        authProviderId: 'sub-2',
        email: 'p2@x.com',
        name: 'Pat2',
        role: UserRole.PATIENT,
        referralCode: 'NUTRI-ZZZZZ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates a nutritionist with a generated referral code', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-3' } as any);

    await service.createWithProfile({
      authProviderId: 'sub-3',
      email: 'n@x.com',
      name: 'Nut',
      role: UserRole.NUTRITIONIST,
    });

    const createArg = prisma.user.create.mock.calls[0][0] as any;
    expect(createArg.data.role).toBe(UserRole.NUTRITIONIST);
    expect(createArg.data.nutritionistProfile.create.referralCode).toMatch(
      /^NUTRI-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/,
    );
  });

  it('updates email and name for an existing user', async () => {
    prisma.user.update.mockResolvedValue({ id: 'user-4' } as any);

    await service.updateBasics('user-4', { email: 'new@x.com', name: 'New' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-4' },
      data: { email: 'new@x.com', name: 'New' },
      include: { nutritionistProfile: true, patientProfile: true },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/api test -- users.service`
Expected: FAIL with "Cannot find module './users.service'".

- [ ] **Step 3: Implement `users.service.ts`**

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocalUser } from '../auth/types/auth-context';
import { generateReferralCode } from '../common/referral-code';

interface CreateWithProfileInput {
  authProviderId: string;
  email: string;
  name: string;
  role: UserRole;
  referralCode?: string;
}

const INCLUDE_PROFILES = {
  nutritionistProfile: true,
  patientProfile: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createWithProfile(input: CreateWithProfileInput): Promise<LocalUser> {
    const base = {
      authProvider: 'SUPABASE',
      authProviderId: input.authProviderId,
      email: input.email,
      name: input.name,
      role: input.role,
    };

    if (input.role === UserRole.NUTRITIONIST) {
      return this.prisma.user.create({
        data: {
          ...base,
          nutritionistProfile: { create: { referralCode: generateReferralCode() } },
        },
        include: INCLUDE_PROFILES,
      });
    }

    let nutritionistId: string | undefined;
    if (input.referralCode) {
      const nutritionist = await this.prisma.nutritionistProfile.findUnique({
        where: { referralCode: input.referralCode },
      });
      if (!nutritionist) {
        throw new BadRequestException('Invalid referral code');
      }
      nutritionistId = nutritionist.id;
    }

    return this.prisma.user.create({
      data: {
        ...base,
        patientProfile: { create: { nutritionistId } },
      },
      include: INCLUDE_PROFILES,
    });
  }

  async updateBasics(
    id: string,
    data: { email: string; name: string },
  ): Promise<LocalUser> {
    return this.prisma.user.update({
      where: { id },
      data,
      include: INCLUDE_PROFILES,
    });
  }

  async findByAuthProviderId(authProviderId: string): Promise<LocalUser | null> {
    return this.prisma.user.findUnique({
      where: {
        authProvider_authProviderId: { authProvider: 'SUPABASE', authProviderId },
      },
      include: INCLUDE_PROFILES,
    });
  }
}
```

> Note: the referralCode unique-collision retry is exercised at the DB level. The generator's 32^5 ≈ 33M space makes collisions rare; a hardening retry loop is deferred (logged as out of scope for this sub-project — see spec). `Prisma` import kept for typing of future use is removed if unused — verify lint passes.

- [ ] **Step 4: Remove the unused `Prisma` import if lint flags it**

If `pnpm --filter @nutri-plus/api build` warns about an unused `Prisma` import, delete it from the import line:
```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
```

- [ ] **Step 5: Create `users.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @nutri-plus/api test -- users.service`
Expected: 4 passing tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/users
git commit -m "feat(api): add UsersService for user+profile creation and lookups"
```

---

## Task 9: AuthService (syncUser + me, TDD)

**Files:**
- Create: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Write the failing test `auth.service.spec.ts`**

```ts
import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuthContext } from './types/auth-context';

describe('AuthService', () => {
  let users: jest.Mocked<Pick<UsersService, 'createWithProfile' | 'updateBasics'>>;
  let service: AuthService;

  beforeEach(() => {
    users = {
      createWithProfile: jest.fn(),
      updateBasics: jest.fn(),
    } as any;
    service = new AuthService(users as unknown as UsersService);
  });

  const newCtx: AuthContext = {
    authProviderId: 'sub-1',
    email: 'a@x.com',
    name: 'Ann',
    user: null,
  };

  it('creates a new user on first sync', async () => {
    users.createWithProfile.mockResolvedValue({ id: 'u1' } as any);

    await service.syncUser(newCtx, { role: UserRole.PATIENT, referralCode: 'NUTRI-ABCDE' });

    expect(users.createWithProfile).toHaveBeenCalledWith({
      authProviderId: 'sub-1',
      email: 'a@x.com',
      name: 'Ann',
      role: UserRole.PATIENT,
      referralCode: 'NUTRI-ABCDE',
    });
  });

  it('updates basics when the user already exists (idempotent)', async () => {
    const existingCtx: AuthContext = {
      ...newCtx,
      user: { id: 'u1', email: 'old@x.com', name: 'Old' } as any,
    };
    users.updateBasics.mockResolvedValue({ id: 'u1' } as any);

    await service.syncUser(existingCtx, { role: UserRole.PATIENT });

    expect(users.updateBasics).toHaveBeenCalledWith('u1', {
      email: 'a@x.com',
      name: 'Ann',
    });
    expect(users.createWithProfile).not.toHaveBeenCalled();
  });

  it('me() returns the resolved local user', () => {
    const ctx: AuthContext = { ...newCtx, user: { id: 'u1' } as any };
    expect(service.me(ctx)).toEqual({ id: 'u1' });
  });

  it('me() throws when the user has not synced yet', () => {
    expect(() => service.me(newCtx)).toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/api test -- auth.service`
Expected: FAIL with "Cannot find module './auth.service'".

- [ ] **Step 3: Implement `auth.service.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { AuthContext, LocalUser } from './types/auth-context';
import { SyncUserDto } from './dto/sync-user.dto';

@Injectable()
export class AuthService {
  constructor(private readonly users: UsersService) {}

  async syncUser(ctx: AuthContext, dto: SyncUserDto): Promise<LocalUser> {
    if (ctx.user) {
      return this.users.updateBasics(ctx.user.id, {
        email: ctx.email,
        name: ctx.name,
      });
    }
    return this.users.createWithProfile({
      authProviderId: ctx.authProviderId,
      email: ctx.email,
      name: ctx.name,
      role: dto.role,
      referralCode: dto.referralCode,
    });
  }

  me(ctx: AuthContext): LocalUser {
    if (!ctx.user) {
      throw new NotFoundException('User not synced. Call POST /v1/auth/sync-user first.');
    }
    return ctx.user;
  }
}
```

> The `SyncUserDto` import is created in Task 10 Step 1. If implementing strictly in order, create the DTO first (Task 10 Step 1) before running the build; the unit test above does not import the DTO type at runtime so it passes once `auth.service.ts` compiles. To keep the build green within this task, also create `dto/sync-user.dto.ts` now (see Task 10 Step 1 for its exact contents).

- [ ] **Step 4: Create `dto/sync-user.dto.ts` (also referenced in Task 10)**

```ts
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { UserRole } from '@prisma/client';

export class SyncUserDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsString()
  @Matches(/^NUTRI-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/, {
    message: 'referralCode must match NUTRI-XXXXX',
  })
  referralCode?: string;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @nutri-plus/api test -- auth.service`
Expected: 4 passing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts apps/api/src/auth/dto
git commit -m "feat(api): add AuthService sync-user and me with DTO validation"
```

---

## Task 10: AuthController + module wiring + global guards/pipe/filter

**Files:**
- Create: `apps/api/src/auth/auth.controller.ts`, `src/auth/auth.module.ts`
- Create: `apps/api/src/common/filters/all-exceptions.filter.ts`
- Modify: `apps/api/src/app.module.ts`, `src/main.ts`

- [ ] **Step 1: (DTO already created in Task 9 Step 4 — verify it exists)**

Confirm `apps/api/src/auth/dto/sync-user.dto.ts` exists with the contents from Task 9 Step 4.

- [ ] **Step 2: Create `auth.controller.ts`**

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthContext, LocalUser } from './types/auth-context';
import { SyncUserDto } from './dto/sync-user.dto';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('sync-user')
  @HttpCode(HttpStatus.OK)
  syncUser(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: SyncUserDto,
  ): Promise<LocalUser> {
    return this.auth.syncUser(ctx, dto);
  }

  @Get('me')
  me(@CurrentUser() ctx: AuthContext): LocalUser {
    return this.auth.me(ctx);
  }
}
```

- [ ] **Step 3: Create `auth.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseStrategy } from './strategies/supabase.strategy';

@Module({
  imports: [PassportModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService, SupabaseStrategy],
})
export class AuthModule {}
```

- [ ] **Step 4: Create `common/filters/all-exceptions.filter.ts`**

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        error = (body.error as string) ?? exception.name;
      }
    }

    response.status(status).json({ statusCode: status, message, error });
  }
}
```

- [ ] **Step 5: Wire everything in `app.module.ts` (global guards)**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv } from './config/env.schema';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SupabaseAuthGuard } from './auth/guards/supabase-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
```

> Guard order: NestJS runs `APP_GUARD` providers in registration order, so `SupabaseAuthGuard` (authentication, populates `request.user`) runs before `RolesGuard` (authorization, reads `request.user.user.role`).

- [ ] **Step 6: Wire global pipe + filter in `main.ts`**

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 7: Verify build + unit tests still pass**

Run:
```bash
pnpm --filter @nutri-plus/api build
pnpm --filter @nutri-plus/api test
```
Expected: build succeeds; all unit tests pass (env, referral-code, roles.guard, users.service, auth.service, app.module).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth apps/api/src/common/filters apps/api/src/app.module.ts apps/api/src/main.ts
git commit -m "feat(api): wire auth controller, module, global guards, pipe, and exception filter"
```

---

## Task 11: e2e tests for /v1/auth endpoints + guards

**Files:**
- Create: `apps/api/test/jest-e2e.config.ts`, `test/setup-e2e.ts`, `test/helpers/sign-jwt.ts`, `test/auth.e2e-spec.ts`

> The e2e suite creates `nutri_plus_test` if missing (via the `pg` driver against
> the `postgres` maintenance DB), then runs migrations against it before tests.
> `createdb` CLI is not required.

- [ ] **Step 1: Create `test/jest-e2e.config.ts`**

```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/test/setup-e2e.ts'],
};

export default config;
```

- [ ] **Step 2: Create `test/helpers/sign-jwt.ts`**

```ts
import * as jwt from 'jsonwebtoken';

const SECRET = process.env.SUPABASE_JWT_SECRET as string;

interface SignOptions {
  sub: string;
  email: string;
  name?: string;
}

export function signSupabaseJwt({ sub, email, name }: SignOptions): string {
  return jwt.sign(
    {
      sub,
      email,
      user_metadata: name ? { name } : {},
    },
    SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}
```

- [ ] **Step 3a: Create `test/ensure-test-db.ts`**

Creates the test database if it doesn't exist, using the `pg` driver against the
`postgres` maintenance database (no `createdb` CLI needed).

```ts
import { Client } from 'pg';

const TEST_DB = 'nutri_plus_test';
const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ??
  'postgresql://postgres:1234@localhost:5432/postgres';

export async function ensureTestDatabase(): Promise<void> {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TEST_DB],
    );
    if (rowCount === 0) {
      // Identifier is a constant, not user input — safe to interpolate.
      await client.query(`CREATE DATABASE ${TEST_DB}`);
    }
  } finally {
    await client.end();
  }
}
```

- [ ] **Step 3b: Create `test/setup-e2e.ts`**

```ts
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { ensureTestDatabase } from './ensure-test-db';

// Point the app at the test database for the whole suite.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:1234@localhost:5432/nutri_plus_test?schema=public';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon';
process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret';
process.env.OPENAI_API_KEY = 'sk-test';

const prisma = new PrismaClient();

beforeAll(async () => {
  await ensureTestDatabase();
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
});

beforeEach(async () => {
  // Order matters: children before parents (FK constraints).
  await prisma.patientProfile.deleteMany();
  await prisma.nutritionistProfile.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

- [ ] **Step 4: Write the e2e test `test/auth.e2e-spec.ts`**

```ts
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { signSupabaseJwt } from './helpers/sign-jwt';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests without a token (401)', async () => {
    await request(app.getHttpServer()).get('/v1/auth/me').expect(401);
  });

  it('syncs a nutritionist and returns a referral code', async () => {
    const token = signSupabaseJwt({ sub: 'nutri-sub', email: 'n@x.com', name: 'Nut' });

    const res = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.NUTRITIONIST })
      .expect(200);

    expect(res.body.role).toBe('NUTRITIONIST');
    expect(res.body.nutritionistProfile.referralCode).toMatch(
      /^NUTRI-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/,
    );
  });

  it('is idempotent: a second sync updates instead of duplicating', async () => {
    const token = signSupabaseJwt({ sub: 'nutri-sub', email: 'n@x.com', name: 'Nut' });
    await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.NUTRITIONIST })
      .expect(200);

    const updatedToken = signSupabaseJwt({ sub: 'nutri-sub', email: 'n2@x.com', name: 'Nut2' });
    const res = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${updatedToken}`)
      .send({ role: UserRole.NUTRITIONIST })
      .expect(200);

    expect(res.body.email).toBe('n2@x.com');
    expect(res.body.name).toBe('Nut2');
  });

  it('links a patient to a nutritionist via referral code', async () => {
    const nutToken = signSupabaseJwt({ sub: 'nutri-2', email: 'n3@x.com', name: 'Nut3' });
    const nutRes = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${nutToken}`)
      .send({ role: UserRole.NUTRITIONIST })
      .expect(200);
    const referralCode = nutRes.body.nutritionistProfile.referralCode;

    const patToken = signSupabaseJwt({ sub: 'pat-1', email: 'p@x.com', name: 'Pat' });
    const patRes = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${patToken}`)
      .send({ role: UserRole.PATIENT, referralCode })
      .expect(200);

    expect(patRes.body.patientProfile.nutritionistId).toBe(
      nutRes.body.nutritionistProfile.id,
    );
  });

  it('rejects an unknown referral code (400)', async () => {
    const patToken = signSupabaseJwt({ sub: 'pat-2', email: 'p2@x.com', name: 'Pat2' });
    await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${patToken}`)
      .send({ role: UserRole.PATIENT, referralCode: 'NUTRI-ZZZZZ' })
      .expect(400);
  });

  it('GET /v1/auth/me returns the synced user', async () => {
    const token = signSupabaseJwt({ sub: 'me-sub', email: 'me@x.com', name: 'Me' });
    await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.PATIENT })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.email).toBe('me@x.com');
    expect(res.body.role).toBe('PATIENT');
  });

  it('rejects an invalid referral code format before hitting the DB (400)', async () => {
    const token = signSupabaseJwt({ sub: 'bad-fmt', email: 'b@x.com', name: 'Bad' });
    await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.PATIENT, referralCode: 'bad-format' })
      .expect(400);
  });
});
```

- [ ] **Step 5: Run the e2e suite**

Run:
```bash
pnpm --filter @nutri-plus/api test:e2e
```
Expected: all e2e tests pass. (First run applies migrations to `nutri_plus_test`.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/test
git commit -m "test(api): e2e coverage for sync-user, me, guards, and referral linking"
```

---

## Task 12: Final wiring — root README + full pipeline run

**Files:**
- Create: `README.md` (root)

- [ ] **Step 1: Create root `README.md`**

```markdown
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
```

- [ ] **Step 2: Run the full turbo build + test pipeline**

Run:
```bash
pnpm install
pnpm build
pnpm --filter @nutri-plus/api test
pnpm --filter @nutri-plus/api test:e2e
```
Expected: build succeeds for `shared-types` and `api`; all unit and e2e tests pass.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add root README with setup and API overview"
```

---

## Self-Review

**Spec coverage:**
- Monorepo layout (pnpm + Turborepo, web/mobile placeholders, shared-types) → Tasks 1, 2. ✓
- NestJS app structure + boundary rules → Tasks 3, 10. ✓
- API versioning (`v1`, URI) → Task 3 (main.ts), Task 10 (controller). ✓
- Data models (User, NutritionistProfile, PatientProfile) → Task 5. ✓
- referralCode generation (NUTRI- + 5 Crockford base32) → Task 6; used in Task 8. ✓
- Auth flow + guards (SupabaseJwtGuard/strategy, @Public, @CurrentUser, RolesGuard, @Roles) → Task 7; global wiring Task 10. ✓
- sync-user behavior (create/update, referral resolution, idempotent) → Tasks 8, 9; e2e Task 11. ✓
- GET /me → Tasks 9, 10; e2e Task 11. ✓
- Config/env validation, local Postgres, .env.example, secrets gitignored → Tasks 4, 5. ✓
- Error handling (ValidationPipe + exception filter, JSON shape) → Task 10. ✓
- Testing (unit: AuthService, referral generator; e2e: endpoints + 401/403, test DB) → Tasks 6, 9, 11. ✓
- pino deferred to Step 09; clinical fields deferred → respected (not in any task). ✓

**Placeholder scan:** No "TBD/TODO" left as work items. The only "deferred" notes (referralCode retry hardening, pino) are explicit out-of-scope per spec, not plan gaps.

**Type consistency:**
- `AuthContext { authProviderId, email, name, user: LocalUser | null }` — defined Task 7, used identically in Tasks 9, 10, 11. ✓
- `LocalUser` (User + nutritionistProfile/patientProfile) — Task 7, used in Tasks 8, 9. ✓
- `UsersService.createWithProfile` / `updateBasics` / `findByAuthProviderId` — signatures defined Task 8 match calls in Task 9. ✓
- Prisma compound unique accessor `authProvider_authProviderId` — used consistently in Task 7 strategy and Task 8 service. ✓
- Referral regex `/^NUTRI-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/` — identical in Tasks 6, 9 (DTO), 11. ✓
- e2e reads `nutritionistProfile.referralCode` / `patientProfile.nutritionistId`, matching the Prisma relation field names from Task 5 and the `INCLUDE_PROFILES` include in Task 8. ✓

No inconsistencies found.
```
