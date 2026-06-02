# Auth: Email/Password Login Route (BFF proxy) — Design Spec

**Date:** 2026-06-02
**Status:** Approved for planning

## Context & purpose

The frontend/mobile apps don't exist yet, so there's no Supabase client SDK to
log in with. To exercise the protected API (`/v1/auth/sync-user`, `/v1/auth/me`,
and future endpoints) via Postman/curl, we need a way to obtain a real Supabase
access token from email + password.

This adds a **backend login proxy (BFF)**: `POST /v1/auth/login` forwards
credentials to Supabase's password grant and returns the session. Supabase
remains the auth authority — the backend does not implement its own auth, store
passwords, or issue its own tokens; it only forwards credentials (over TLS) and
relays Supabase's response.

This **updates** the documented rule "the backend does not implement login": a
thin login proxy now exists, primarily as a manual-testing entry point until the
frontend lands.

## Scope

- **In:** `POST /v1/auth/login` only.
- **Out (YAGNI):** signup, password reset, token refresh, logout. Those stay with
  Supabase / the future frontend SDK.
- **No automated tests** for this route (it is a manual-testing convenience;
  per explicit decision). Existing unit + e2e suites must remain green.

## Endpoint

`POST /v1/auth/login` — **public** (`@Public()`, so the global `SupabaseAuthGuard`
does not require a token; `RolesGuard` allows it since no `@Roles`).

**Request** (`LoginDto`, validated by the global `ValidationPipe`):
```json
{ "email": "user@example.com", "password": "secret" }
```
- `email`: `@IsEmail()`
- `password`: `@IsString()` + `@MinLength(1)`

**Behavior:** `AuthService.login(dto)` issues
`POST ${SUPABASE_URL}/auth/v1/token?grant_type=password` with headers
`apikey: ${SUPABASE_ANON_KEY}` and `Content-Type: application/json`, body
`{ email, password }`, using the Node 24 global `fetch` (no new dependency).

**Success (Supabase 200):** Supabase returns `{ access_token, refresh_token,
token_type, expires_in, expires_at, user, ... }`. Return a trimmed shape:
```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<token>",
  "tokenType": "bearer",
  "expiresIn": 3600
}
```
The `accessToken` is what you put in `Authorization: Bearer <accessToken>` to call
the protected endpoints.

**Failure:**
- Supabase non-2xx (invalid credentials, unconfirmed email, etc.) → **401**
  `Invalid email or password`.
- Network/unexpected error reaching Supabase → **502** `Auth provider unavailable`.
- The password is never logged (the exception filter only logs 5xx stacks; the
  service must not log the request body or credentials).

## Contracts

The response type stays **local to `apps/api`** (defined in `auth/dto/login.dto.ts`):
```ts
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}
```
Rationale: `apps/api` does not yet import `@nutri-plus/shared-types` anywhere, so
adding the first import would couple the API's build/test to `shared-types` being
built first. For a manual-testing route that's not worth it. Promoting
`LoginRequest`/`LoginResponse` into `shared-types` is deferred until a real client
(web/mobile) consumes the contract — at which point the build-ordering is set up
deliberately.

## Components / files

- `apps/api/src/auth/dto/login.dto.ts` (new) — `LoginDto` + the `LoginResponse` interface.
- `apps/api/src/auth/auth.service.ts` — inject `ConfigService`; add `login(dto): Promise<LoginResponse>`.
- `apps/api/src/auth/auth.controller.ts` — add `@Post('login') @Public() @HttpCode(200) login(...)`.
- `docs/architecture.md` — note the login proxy (auth authority stays with
  Supabase; backend forwards, never stores passwords).
- Config: uses existing `SUPABASE_URL` + `SUPABASE_ANON_KEY` (no env changes).

## Error handling

A small typed result: on a non-ok Supabase response, throw `UnauthorizedException`
(401); on a thrown `fetch` error, throw a 502 (`BadGatewayException`). Both surface
through the existing global `AllExceptionsFilter` as the standard
`{ statusCode, message, error }` shape.

## Testing

No automated tests for this route (manual-testing convenience). Verification:
- `pnpm --filter @nutri-plus/api build` compiles.
- Existing unit (24) + e2e (8) suites stay green.
- Manual: `curl -X POST http://localhost:3000/v1/auth/login -H 'content-type: application/json' -d '{"email":"...","password":"..."}'` returns the tokens; the returned `accessToken` then works on `GET /v1/auth/me` after `sync-user`.

## Out of scope

Signup, refresh, logout, password reset; any automated test coverage for this
route; rate-limiting / brute-force protection (Supabase handles auth throttling).
