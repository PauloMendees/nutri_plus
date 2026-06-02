# Auth: JWKS / ES256 Verification — Design Spec

**Date:** 2026-06-01
**Status:** Approved for planning
**Supersedes:** the HS256 + shared-secret auth decision in the backend-foundation spec.

## Context

The backend foundation validated Supabase JWTs with **HS256 + `SUPABASE_JWT_SECRET`**
(a shared secret). Inspection of the live Supabase project (`alwyxmgdslvhsrzhnyud`)
showed it has rotated its JWT signing key to **asymmetric ECC P-256 (ES256)**:

- `/.well-known/jwks.json` serves one ES256 key.
- Dashboard → JWT Keys: **CURRENT KEY** is `ECC (P-256)`; the **PREVIOUS KEY** is the
  `Legacy HS256 (Shared Secret)` (rotated ~recently).

So new user tokens are signed with ES256 and verified via the project's **public**
keys (JWKS). The HS256 shared secret is legacy and only verifies not-yet-expired
old tokens — it is a dead end. The backend must verify against the JWKS.

## Goal

Migrate `SupabaseStrategy` to verify Supabase access tokens via the project's JWKS
endpoint using ES256, and remove the now-unnecessary `SUPABASE_JWT_SECRET`.

## Approach

Replace passport-jwt's static `secretOrKey` (HS256) with a **`secretOrKeyProvider`**
backed by **`jwks-rsa`** (which supports EC keys), fetching the signing key by `kid`
from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Drop HS256 entirely (no
fallback to the legacy secret — YAGNI; the previous key expires with old tokens).

### Strategy (`apps/api/src/auth/strategies/supabase.strategy.ts`)

```ts
import { passportJwtSecret } from 'jwks-rsa';
// ...
const supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
super({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  ignoreExpiration: false,
  algorithms: ['ES256'],
  issuer: `${supabaseUrl}/auth/v1`,
  audience: 'authenticated',
  secretOrKeyProvider: passportJwtSecret({
    jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    cache: true,
    rateLimit: true,
  }),
});
```

`validate(payload)` is unchanged: require `email` (else `UnauthorizedException`),
resolve the local user via `UsersService.findByAuthProviderId`, return the
`AuthContext`. `issuer` + `audience: 'authenticated'` are added as defense-in-depth
(both are present on real Supabase tokens).

### Environment

- **Remove `SUPABASE_JWT_SECRET`** from: `env.schema.ts`, `env.schema.spec.ts`,
  `.env.example`, `test/jest-setup-env.ts`, and the developer's `.env`.
- `SUPABASE_URL` (already required) becomes the JWKS discovery source — nothing new
  to configure.
- `env.schema.spec.ts`: the "missing required var" test switches from
  `SUPABASE_JWT_SECRET` to `SUPABASE_URL`.

### Dependency

- Add **`jwks-rsa`** as a runtime dependency of `apps/api`.
- `jsonwebtoken` (+ `@types/jsonwebtoken`) stays as a devDependency — tests now sign
  ES256 instead of HS256.

## Testing

Chosen approach: **ephemeral ES256 keypair + a local JWKS HTTP server** (fully
offline, deterministic, exercises the real fetch + verify path).

New helper `apps/api/test/helpers/jwks.ts`:

- Generates an ES256 (P-256) keypair once with a `kid` (Node `crypto`).
- `publicJwk()` — the public key as a JWK (`kty: 'EC'`, `crv: 'P-256'`, `alg: 'ES256'`,
  `use: 'sig'`, `kid`).
- `startJwksServer()` — a tiny `http` server serving
  `/auth/v1/.well-known/jwks.json` → `{ keys: [publicJwk] }`; returns `{ url, close }`.
- `signSupabaseJwt({ sub, email, name })` — signs ES256 with the private key, `kid`
  in the header, and `iss = ${SUPABASE_URL}/auth/v1`, `aud = 'authenticated'`, `exp`.

`apps/api/test/auth.e2e-spec.ts`:

- `beforeAll`: start the JWKS server, set `process.env.SUPABASE_URL` to its address
  (a valid URL, passes env validation), then create + init the Nest app (so the
  strategy builds its `jwksUri` from that URL).
- `afterAll`: close the server and the app.
- The existing 8 scenarios remain (401 no token, sync nutritionist, idempotent
  re-sync, 409 unsynced `/me`, patient↔nutritionist referral link, unknown referral
  400, `GET /me`, invalid referral format 400). The old HS256 `sign-jwt.ts` helper is
  replaced by the ES256 signer.

Unit tests (`roles.guard`, `users.service`, `auth.service`, `env.schema`,
`app.module`) are unaffected except the `env.schema` change above. The JWKS/ES256
verification path is covered end-to-end by the e2e suite (the strategy has no unit
test, consistent with the foundation).

## Error Handling

- Missing / malformed token, unknown `kid`, algorithm ≠ ES256, bad `issuer`/`audience`,
  expired token → **401** (Passport).
- Missing `email` claim → **401** (`UnauthorizedException`, unchanged).
- JWKS endpoint unreachable → authentication failure → **401**.

## Files Touched

- `apps/api/src/auth/strategies/supabase.strategy.ts` — ES256 + JWKS provider.
- `apps/api/src/config/env.schema.ts` + `env.schema.spec.ts` — drop `SUPABASE_JWT_SECRET`.
- `apps/api/package.json` — add `jwks-rsa`.
- `apps/api/.env.example` — drop `SUPABASE_JWT_SECRET`; note `SUPABASE_URL` powers JWKS.
- `apps/api/test/jest-setup-env.ts` — drop `SUPABASE_JWT_SECRET`.
- `apps/api/test/helpers/jwks.ts` (new) — replaces `helpers/sign-jwt.ts`.
- `apps/api/test/setup-e2e.ts` — drop `SUPABASE_JWT_SECRET`.
- `apps/api/test/auth.e2e-spec.ts` — JWKS server lifecycle + ES256 signer.
- `docs/architecture.md` and the foundation spec — note auth is JWKS/ES256, not HS256.

## Out of Scope

- Supporting the legacy HS256 secret as a fallback (dropped).
- Key rotation / standby-key handling beyond what `jwks-rsa` caching provides.
- Asymmetric-signing changes to any non-Supabase auth.
