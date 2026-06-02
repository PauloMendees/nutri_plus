# Email/Password Login Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /v1/auth/login` — a thin backend proxy that exchanges email+password for a Supabase session, so the protected API can be exercised manually (Postman/curl) before the frontend exists.

**Architecture:** A public route on the existing `AuthController`; `AuthService.login` forwards credentials to Supabase's password grant (`POST ${SUPABASE_URL}/auth/v1/token?grant_type=password`, `apikey: SUPABASE_ANON_KEY`) using Node 24's global `fetch`, and returns a trimmed `{ accessToken, refreshToken, tokenType, expiresIn }`. Supabase stays the auth authority; the backend forwards (over TLS) and never stores or logs the password.

**Tech Stack:** NestJS 10, `@nestjs/config` (ConfigService), class-validator, Node global `fetch`. No new dependency.

**Spec:** `docs/superpowers/specs/2026-06-02-auth-login-route-design.md`

**Note:** No automated tests for this route (manual-testing convenience, per explicit decision). The existing unit (24) + e2e (8) suites must stay green, and the project must build.

---

## File Structure

```
apps/api/src/auth/
├── dto/login.dto.ts        # NEW: LoginDto (email, password) + LoginResponse interface
├── auth.service.ts         # + login(dto): Promise<LoginResponse> (inject ConfigService)
└── auth.controller.ts      # + @Post('login') @Public() @HttpCode(200)
docs/architecture.md        # note the login proxy
```

---

## Task 1: Login DTO + response type

**Files:** Create `apps/api/src/auth/dto/login.dto.ts`

- [ ] **Step 1: Create `apps/api/src/auth/dto/login.dto.ts`**

```ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/auth/dto/login.dto.ts
git commit -m "feat(api): add LoginDto and LoginResponse type"
```

---

## Task 2: AuthService.login (Supabase password-grant proxy)

**Files:** Modify `apps/api/src/auth/auth.service.ts`

- [ ] **Step 1: Replace `apps/api/src/auth/auth.service.ts` with the version that adds `login`**

`AuthService` gains a `ConfigService` dependency and the `login` method. The existing `syncUser`/`me` are unchanged.

```ts
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { AuthContext, LocalUser } from './types/auth-context';
import { SyncUserDto } from './dto/sync-user.dto';
import { LoginDto, LoginResponse } from './dto/login.dto';

interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

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
      // Authenticated, but no local record yet: the caller must sync first.
      // 409 (not 404) so clients don't misread it as a missing route.
      throw new ConflictException(
        'User not synced. Call POST /v1/auth/sync-user first.',
      );
    }
    return ctx.user;
  }

  // Thin proxy to Supabase's password grant so the API can be exercised
  // manually before the frontend (which would use the Supabase SDK) exists.
  // The password is forwarded over TLS and never stored or logged.
  async login(dto: LoginDto): Promise<LoginResponse> {
    const baseUrl = this.config.getOrThrow<string>('SUPABASE_URL');
    const anonKey = this.config.getOrThrow<string>('SUPABASE_ANON_KEY');

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: anonKey },
        body: JSON.stringify({ email: dto.email, password: dto.password }),
      });
    } catch {
      throw new BadGatewayException('Auth provider unavailable');
    }

    if (!response.ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const data = (await response.json()) as SupabaseTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
    };
  }
}
```

- [ ] **Step 2: Verify the unit suite still passes**

`AuthService` now takes a second constructor arg (`ConfigService`). The unit test `auth.service.spec.ts` constructs `new AuthService(users as unknown as UsersService)` — TypeScript-wise this is fine (the spec casts), and the existing tests only exercise `syncUser`/`me`, which don't touch `config`. Run:
```bash
pnpm --filter @nutri-plus/api test
```
Expected: all 24 unit tests still pass. If `auth.service.spec.ts` fails to construct `AuthService` (it should not, since the missing 2nd arg is `undefined` and unused by syncUser/me), report it; do not loosen the service.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/auth/auth.service.ts
git commit -m "feat(api): AuthService.login proxies Supabase password grant"
```

---

## Task 3: Controller route + wiring

**Files:** Modify `apps/api/src/auth/auth.controller.ts`

- [ ] **Step 1: Replace `apps/api/src/auth/auth.controller.ts`**

Adds the public `login` route. `@Public()` exempts it from the global `SupabaseAuthGuard`; `RolesGuard` allows it (no `@Roles`).

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthContext, LocalUser } from './types/auth-context';
import { SyncUserDto } from './dto/sync-user.dto';
import { LoginDto, LoginResponse } from './dto/login.dto';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.auth.login(dto);
  }

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

- [ ] **Step 2: Build + run the unit suite**

Run:
```bash
pnpm --filter @nutri-plus/api build
pnpm --filter @nutri-plus/api test
```
Expected: build clean; 24 unit tests pass. (`AuthModule` already provides `AuthService`; `ConfigModule` is global so `ConfigService` injects without changes.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/auth/auth.controller.ts
git commit -m "feat(api): expose public POST /v1/auth/login"
```

---

## Task 4: Docs

**Files:** Modify `docs/architecture.md`

- [ ] **Step 1: Add a login-proxy note under the `## Authentication` section of `docs/architecture.md`**

Append after the existing "The backend never stores passwords." line:

```markdown
For manual testing before the frontend exists, the backend exposes a thin login
proxy `POST /v1/auth/login` that forwards email+password to Supabase's password
grant and returns the session. Supabase remains the auth authority; the backend
forwards credentials over TLS and never stores them.
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: note the login proxy route in architecture"
```

---

## Task 5: Verify + manual check guidance

- [ ] **Step 1: Full verification**

Run:
```bash
pnpm --filter @nutri-plus/api build
pnpm --filter @nutri-plus/api test
pnpm --filter @nutri-plus/api test:e2e
```
Expected: build clean; 24 unit pass; 8 e2e pass (this change touches none of the e2e paths).

- [ ] **Step 2: Manual smoke (requires real Supabase creds in `apps/api/.env`)**

Start the API (`pnpm --filter @nutri-plus/api dev`) and, with a real Supabase user:
```bash
curl -sX POST http://localhost:3000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"<real-user>","password":"<real-pass>"}'
```
Expected: `200` with `{ accessToken, refreshToken, tokenType, expiresIn }`. A wrong password returns `401 { "statusCode": 401, "message": "Invalid email or password", ... }`. The `accessToken` then works as `Authorization: Bearer <accessToken>` on `POST /v1/auth/sync-user` and `GET /v1/auth/me`.

(This manual step depends on the JWKS/ES256 verification from PR #4 being present for the returned token to validate on the protected routes; on a branch off `main` without it, login still returns tokens, but `/me` verification matches whatever strategy `main` has.)

---

## Self-Review

**Spec coverage:**
- `POST /v1/auth/login`, public, LoginDto (email IsEmail / password IsString+MinLength) → Tasks 1, 3. ✓
- Proxy to `${SUPABASE_URL}/auth/v1/token?grant_type=password` with `apikey` header via global fetch → Task 2. ✓
- Trimmed response `{ accessToken, refreshToken, tokenType, expiresIn }` → Tasks 1 (type), 2 (mapping). ✓
- Invalid creds → 401; network error → 502; password never logged → Task 2 (UnauthorizedException / BadGatewayException; no logging of body). ✓
- Response type local to api (not shared-types) → Task 1. ✓
- Uses existing env (SUPABASE_URL, SUPABASE_ANON_KEY); no env changes → Task 2. ✓
- No automated tests for the route; existing suites green; build clean → Task 5. ✓
- Docs note → Task 4. ✓

**Placeholder scan:** No TBD/TODO; all steps carry concrete code or exact commands.

**Type consistency:**
- `LoginDto` / `LoginResponse` defined in Task 1, imported identically in Tasks 2 and 3. ✓
- `AuthService` constructor `(UsersService, ConfigService)` — `AuthModule` provides `AuthService`; `ConfigService` is global (no provider change needed). The existing `auth.service.spec.ts` constructs `new AuthService(users)` (1 arg) — compiles via its `as unknown as UsersService` cast and the unused 2nd param is `undefined` at runtime, harmless for the syncUser/me tests. ✓
- `SupabaseTokenResponse` fields map to `LoginResponse` fields in Task 2. ✓
- `@Public` imported from `./decorators/public.decorator` (exists from the foundation). ✓

No inconsistencies found.
