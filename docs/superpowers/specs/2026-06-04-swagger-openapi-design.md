# Swagger / OpenAPI Docs — Design Spec

**Date:** 2026-06-04
**Status:** Approved for planning

## Context & purpose

The frontend/mobile apps don't exist yet, so the API is exercised manually
(Postman/curl). Interactive API docs make that easier: a browsable list of every
endpoint, request/response schemas, and a "try it" console with auth. This adds
**Swagger UI / OpenAPI** to `apps/api`, on the current `feat/patient-management`
branch.

## Decisions

- **Always enabled** in every environment (no `NODE_ENV` gating). Simplest; no env
  schema change. (Trade-off acknowledged: the API schema + interactive console are
  public once deployed. Revisit if/when a production hardening pass happens.)
- **Schemas via the `@nestjs/swagger` CLI plugin** — auto-derives `@ApiProperty`
  metadata from DTO types and the existing `class-validator` decorators. No manual
  `@ApiProperty` annotations; DTOs stay clean and can't drift from validators.

## Scope

- **In:** add `@nestjs/swagger`, enable its CLI plugin, mount Swagger UI at `/docs`
  (OpenAPI JSON at `/docs-json`), wire Bearer auth into the UI, group endpoints with
  tags, and one smoke e2e.
- **Out (YAGNI):** environment gating, manual per-field `@ApiProperty` decorators,
  custom response DTOs / `@ApiResponse` examples, auth/route/behavior changes,
  generating a client SDK from the spec.

## Components / files

- `apps/api/package.json` — add `@nestjs/swagger` (version compatible with NestJS 10;
  install its required peer for the Express adapter if the chosen version needs one).
- `apps/api/nest-cli.json` — add the Swagger CLI plugin:
  ```json
  {
    "compilerOptions": {
      "plugins": [
        { "name": "@nestjs/swagger", "options": { "introspectComments": true } }
      ]
    }
  }
  ```
  (merged into the existing `compilerOptions`, not replacing it).
- `apps/api/src/main.ts` — after `app.enableVersioning(...)` and before `app.listen(...)`,
  build the document and mount it:
  ```ts
  const config = new DocumentBuilder()
    .setTitle('Nutri Plus API')
    .setDescription('Nutritionist SaaS backend API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  ```
  Order matters: `createDocument` runs after versioning is enabled so paths carry
  their `/v1` prefix.
- `apps/api/src/auth/auth.controller.ts` and
  `apps/api/src/patients/patients.controller.ts` — add class-level `@ApiTags(...)`
  and `@ApiBearerAuth()` (so the UI groups endpoints and marks them as secured; the
  Authorize button then applies the pasted token). No per-route decorators.

## Behavior

- `GET /docs` — Swagger UI (HTML console).
- `GET /docs-json` — the raw OpenAPI 3 document.
- The UI's **Authorize** button accepts a Bearer token; paste the `accessToken`
  returned by `POST /v1/auth/login` to call protected endpoints (`sync-user`, `me`,
  all `/v1/patients` routes). `@Public()` routes (e.g. `login`) require no token.
- All existing routes appear under their versioned paths (`/v1/auth/*`,
  `/v1/patients/*`) with request bodies/enums derived from the DTOs and validators.

## Testing

- `pnpm --filter @nutri-plus/api build` compiles (the CLI plugin runs during the
  Nest build).
- **Smoke e2e** (`apps/api/test/docs.e2e-spec.ts` or folded into an existing spec):
  boot the app (reusing the JWKS bootstrap pattern), `GET /docs-json` → `200`, and
  assert `body.paths` contains `/v1/patients` and `/v1/auth/login`. This guards
  against the document failing to generate (e.g. a decorator/plugin regression).
- The existing suites (34 unit, 17 e2e) must remain green.

## Out of scope

Env-based gating, manual `@ApiProperty`/`@ApiResponse` decorators and examples,
response-shape DTOs, SDK/client generation, auth or endpoint changes.
