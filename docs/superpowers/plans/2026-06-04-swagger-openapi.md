# Swagger / OpenAPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive Swagger UI (`/docs`) + OpenAPI JSON (`/docs-json`) to the NestJS API, with Bearer auth in the console and DTO schemas auto-derived from validators.

**Architecture:** A reusable `setupSwagger(app)` helper builds the OpenAPI document (Bearer scheme, title/version) and mounts the UI; both `main.ts` and the smoke e2e call it. The `@nestjs/swagger` CLI plugin (configured in `nest-cli.json`) auto-generates `@ApiProperty` metadata from DTO types + class-validator decorators during `nest build`. Controllers get class-level `@ApiTags` + `@ApiBearerAuth` only — no per-route decorators.

**Tech Stack:** NestJS 10.4, `@nestjs/swagger` ^8, TypeScript, Jest + Supertest.

**Spec:** `docs/superpowers/specs/2026-06-04-swagger-openapi-design.md`

**Conventions:**
- pnpm is at `~/.local/bin/pnpm`; prefix shell with `export PATH="$HOME/.local/bin:$PATH"`.
- Run API scripts via `pnpm --filter @nutri-plus/api <script>`.
- The e2e bootstrap pattern (JWKS server + `ConfigService` override + URI versioning) lives in `apps/api/test/auth.e2e-spec.ts` — mirror it.

---

## File Structure

- `apps/api/package.json` — **Modify**: add `@nestjs/swagger` dependency (via pnpm).
- `apps/api/nest-cli.json` — **Modify**: add the Swagger CLI plugin to `compilerOptions.plugins`.
- `apps/api/src/swagger.ts` — **Create**: `setupSwagger(app)` helper.
- `apps/api/src/main.ts` — **Modify**: call `setupSwagger(app)` after versioning.
- `apps/api/src/auth/auth.controller.ts` — **Modify**: add `@ApiTags('auth')` + `@ApiBearerAuth()`.
- `apps/api/src/patients/patients.controller.ts` — **Modify**: add `@ApiTags('patients')` + `@ApiBearerAuth()`.
- `apps/api/test/docs.e2e-spec.ts` — **Create**: smoke test for `/docs-json`.

---

## Task 1: Install @nestjs/swagger, enable the CLI plugin, add the setup helper + main.ts wiring

**Files:**
- Modify: `apps/api/package.json` (via pnpm add)
- Modify: `apps/api/nest-cli.json`
- Create: `apps/api/src/swagger.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Install the dependency**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api add @nestjs/swagger
```

Expected: `@nestjs/swagger` (^8.x) added to `apps/api/package.json` dependencies; install completes. If `nest build` or app startup later errors that swagger-ui assets can't be served on the Express adapter, also run `pnpm --filter @nutri-plus/api add swagger-ui-express` and re-verify (recent `@nestjs/swagger` bundles the UI, so this is usually unnecessary).

- [ ] **Step 2: Enable the Swagger CLI plugin in `nest-cli.json`**

Replace the contents of `apps/api/nest-cli.json` with (preserves existing keys, adds `plugins`):

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "plugins": [
      { "name": "@nestjs/swagger", "options": { "introspectComments": true } }
    ]
  }
}
```

- [ ] **Step 3: Create the `setupSwagger` helper**

Create `apps/api/src/swagger.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Builds the OpenAPI document and mounts Swagger UI at /docs (raw JSON at
// /docs-json). Shared by main.ts and the docs e2e so both produce the same spec.
// Call AFTER app.enableVersioning() so route paths carry their /v1 prefix.
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Nutri Plus API')
    .setDescription('Nutritionist SaaS backend API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
```

- [ ] **Step 4: Wire it into `main.ts`**

Edit `apps/api/src/main.ts` to import and call the helper after `enableVersioning` and before `listen`:

```ts
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // The global ValidationPipe and exception filter are registered as providers
  // in AppModule (APP_PIPE / APP_FILTER) so every bootstrap path shares them.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  setupSwagger(app);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 5: Verify the build**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build
```

Expected: build succeeds (the CLI plugin runs during the Nest build).

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/nest-cli.json apps/api/src/swagger.ts apps/api/src/main.ts ../../pnpm-lock.yaml
git commit -m "feat(api): add Swagger/OpenAPI docs at /docs"
```

(If `pnpm-lock.yaml` is at the repo root and unchanged, the `git add` of it is a no-op — that's fine.)

---

## Task 2: Tag + secure the controllers in the docs

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/patients/patients.controller.ts`

- [ ] **Step 1: Annotate `AuthController`**

In `apps/api/src/auth/auth.controller.ts`, add the import and two class-level decorators (keep the existing `@Controller(...)`):

```ts
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
```

```ts
@ApiTags('auth')
@ApiBearerAuth()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
```

(`@ApiBearerAuth()` documents the endpoints as Bearer-secured; the `@Public()` `login` route still works without a token — this only affects the docs' Authorize affordance.)

- [ ] **Step 2: Annotate `PatientsController`**

In `apps/api/src/patients/patients.controller.ts`, add the import and two class-level decorators above the existing `@Controller(...)` / `@Roles(...)`:

```ts
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
```

```ts
@ApiTags('patients')
@ApiBearerAuth()
@Controller({ path: 'patients', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class PatientsController {
```

- [ ] **Step 3: Verify build + unit tests**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build && pnpm --filter @nutri-plus/api test 2>&1 | tail -4
```

Expected: build succeeds; 34 unit tests pass (decorators don't change runtime behavior).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/auth/auth.controller.ts apps/api/src/patients/patients.controller.ts
git commit -m "docs(api): tag and mark Swagger controllers as Bearer-secured"
```

---

## Task 3: Smoke e2e for the OpenAPI document + final verification

**Files:**
- Create: `apps/api/test/docs.e2e-spec.ts`

- [ ] **Step 1: Write the smoke e2e**

Create `apps/api/test/docs.e2e-spec.ts`. It boots the app like `auth.e2e-spec.ts`, calls `setupSwagger`, and asserts the document generates with the expected paths. (The CLI plugin does not run under ts-jest, so DTO schema bodies may be sparse — this test only asserts that paths exist, which come from the route decorators and are unaffected.)

```ts
import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupSwagger } from '../src/swagger';
import { startJwksServer, JwksServer } from './helpers/jwks';

describe('Docs (e2e)', () => {
  let app: INestApplication;
  let jwks: JwksServer;

  beforeAll(async () => {
    jwks = await startJwksServer();
    process.env.SUPABASE_URL = jwks.url;

    const { ConfigService } = await import('@nestjs/config');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue({ getOrThrow: (key: string) => process.env[key] })
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  it('serves the OpenAPI document at /docs-json with the expected paths', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);

    expect(res.body.openapi).toMatch(/^3\./);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/v1/auth/login',
        '/v1/patients',
        '/v1/patients/{id}',
        '/v1/patients/{id}/assessments',
      ]),
    );
  });

  it('declares the bearer security scheme', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body.components?.securitySchemes).toBeDefined();
    const schemes = res.body.components.securitySchemes;
    const hasBearer = Object.values(schemes).some(
      (s: any) => s.type === 'http' && s.scheme === 'bearer',
    );
    expect(hasBearer).toBe(true);
  });
});
```

- [ ] **Step 2: Run the e2e suite**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test:e2e 2>&1 | tail -10
```

Expected: PASS — existing Auth (8) + Patients (9) + the new Docs (2) = 19 e2e tests.

- [ ] **Step 3: Final full verification**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build \
  && pnpm --filter @nutri-plus/api test \
  && pnpm --filter @nutri-plus/api test:e2e
```

Expected: build succeeds; unit 34 pass; e2e 19 pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/docs.e2e-spec.ts
git commit -m "test(api): smoke-test the OpenAPI document and bearer scheme"
```

---

## Self-Review notes (already applied)

- **Spec coverage:** dependency + plugin (Task 1 Steps 1-2), `/docs` + `/docs-json` mount via helper (Task 1 Steps 3-5), Bearer auth + tags on controllers (Task 2), smoke e2e asserting paths + bearer scheme (Task 3). "Always enabled" = `setupSwagger` runs unconditionally in `main.ts`; "CLI plugin" = `nest-cli.json` plugin block.
- **Type/name consistency:** the helper is `setupSwagger` in `apps/api/src/swagger.ts`, imported identically by `main.ts` and `docs.e2e-spec.ts`. Decorator names (`@ApiTags`, `@ApiBearerAuth`) match across both controllers.
- **Testability note:** the CLI plugin runs only during `nest build`, not ts-jest; the smoke e2e deliberately asserts only path/scheme existence (decorator-derived), which is plugin-independent.
- **No scope creep:** no env gating, no `@ApiProperty`/`@ApiResponse`, no response DTOs, no auth/route changes.
