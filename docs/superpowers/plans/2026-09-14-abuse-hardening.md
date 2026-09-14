# Endurecimento anti-abuso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rate limit na API, teto diário de IA aplicado no gateway da OpenAI, gate Turnstile no cadastro web, e remoção do proxy público de login.

**Architecture:** Um guard global do `@nestjs/throttler` registrado antes da autenticação, com chave `user:<sub>` em rota autenticada e `ip:<req.ip>` em rota pública. Um `AiUsageCapService` consultado pelo `OpenAIProvider` antes de qualquer chamada, contando linhas de `AIInteraction` do dia em São Paulo. No web, o formulário de cadastro só chama o `signUp` do Supabase depois que um route handler verifica o token do Turnstile na Cloudflare.

**Tech Stack:** NestJS 10 + `@nestjs/throttler` 6 + Prisma 7 + Jest/supertest (API), Next.js App Router + Vitest + `@marsidev/react-turnstile` (web), Expo + Jest (mobile).

**Spec:** `docs/superpowers/specs/2026-09-14-abuse-hardening-design.md`

## Global Constraints

- Branch `feat/abuse-hardening` (já criada a partir de `main`). Não fazer push nem PR dentro das tarefas; nunca commitar `.env`.
- Argumentar a partir da spec. Copiar as mensagens pt-BR **verbatim**:
  - `Muitas solicitações. Aguarde um minuto e tente de novo.`
  - `Limite diário de IA atingido. Tente amanhã.`
  - `Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.`
- Números da spec: global **120/min**; relay público do Meta **5**; sync-user **20**; gerar/ajustar plano e retry **10**; silhueta **5**; upload e transcrição de áudio **5**; preview da importação **10**; "Fora de casa" **5**. Teto diário: nutricionista **60** (todos os tipos), paciente **10** (`OUTSIDE_HOME_SUGGESTION`). Contagem inclui sucesso e falha.
- Códigos de erro: `RATE_LIMITED` e `AI_DAILY_CAP_EXCEEDED` (ambos HTTP 429); gate: 204 ok, 403 `CAPTCHA_FAILED`, 400 `CAPTCHA_TOKEN_MISSING`, 503 `CAPTCHA_NOT_CONFIGURED`.
- API: aspas simples. Web e mobile: seguir o estilo do arquivo editado.
- Cotas mensais por plano (`PLAN_CATALOG`, `EntitlementsService`) **não** mudam.
- Verificar verde: `pnpm --filter @nutri-plus/api test`; `pnpm --filter @nutri-plus/api test:e2e` (Postgres local em `localhost:5432`, usuário `postgres`, senha `1234`); `pnpm --filter @nutri-plus/web test`; `pnpm --filter @nutri-plus/mobile test`.
- Não adicionar captcha em login/reset/mobile, não mover o `signUp` para a API, não usar Redis, não excluir contas.
- `CONTEXT.md` já define **Teto diário de IA** e **Gate de cadastro**; não reabrir.

## File structure

| File | Responsibility |
|---|---|
| `apps/api/src/common/rate-limit/rate-limit.policy.ts` | Números dos limites e helper `perMinute()` |
| `apps/api/src/common/rate-limit/rate-limited.exception.ts` | HTTP 429 `RATE_LIMITED` com mensagem pt-BR |
| `apps/api/src/common/rate-limit/api-throttler.guard.ts` | Guard: chave por `sub` (rota autenticada) ou IP (pública); lança a exceção acima |
| `apps/api/src/app.module.ts` | `ThrottlerModule.forRoot` + guard como primeiro `APP_GUARD` |
| `apps/api/src/health/health.controller.ts` | `@SkipThrottle()` |
| Controllers de IA, `/signals`, `/auth` | `@Throttle(perMinute(...))` por rota |
| `apps/api/test/rate-limit.e2e-spec.ts` | Seam HTTP do rate limit |
| `apps/api/src/auth/*` | Remoção de `POST /v1/auth/login` |
| `apps/api/src/billing/plan-policy.ts` | `saoPauloDayStart()` ao lado de `saoPauloMonthStart()` |
| `apps/api/src/ai/ai-usage-cap.policy.ts` | Tetos diários e mensagem |
| `apps/api/src/ai/ai-daily-cap.exception.ts` | HTTP 429 `AI_DAILY_CAP_EXCEEDED` |
| `apps/api/src/ai/ai-usage-cap.service.ts` | Contagem do dia e asserção |
| `apps/api/src/ai/openai.provider.ts` | Consulta o teto antes de texto/visão e transcrição |
| `apps/web/src/lib/api/rate-limit-errors.ts` | 429 → mensagem por `code` |
| `apps/web/src/app/providers.tsx` | Toast no handler global de erro |
| `apps/web/src/app/api/signup-gate/route.ts` | Verificação do token na Cloudflare |
| `apps/web/src/lib/auth/signup-gate.ts` | Cliente do gate + site key + mensagem |
| `apps/web/src/components/auth/signup-form.tsx` | Widget Turnstile + gate antes do `signUp` |
| `apps/mobile/app/(app)/fora-de-casa.tsx` | Mensagem do 429 |
| `docs/11-abuse-hardening.md` | O que existe, números, checklist de painel |

---

### Task 1: Rate limit na API (política, guard, wiring, e2e)

**Files:**
- Create: `apps/api/src/common/rate-limit/rate-limit.policy.ts`
- Create: `apps/api/src/common/rate-limit/rate-limited.exception.ts`
- Create: `apps/api/src/common/rate-limit/api-throttler.guard.ts`
- Create: `apps/api/src/common/rate-limit/api-throttler.guard.spec.ts`
- Modify: `apps/api/src/app.module.ts:40-42` (imports) e `:78-90` (providers + comentário)
- Modify: `apps/api/src/health/health.controller.ts`
- Modify: `apps/api/src/meta/meta-signals.controller.ts:26-27`
- Modify: `apps/api/src/auth/auth.controller.ts:23-24`
- Modify: `apps/api/src/meal-generation/meal-generation.controller.ts:19-20,29-30`
- Modify: `apps/api/src/ai-jobs/ai-jobs.controller.ts:27-28`
- Modify: `apps/api/src/silhueta/silhueta.controller.ts:29-30`
- Modify: `apps/api/src/patients/audios/audios.controller.ts:27-28,48-49`
- Modify: `apps/api/src/patients/import/import.controller.ts:41-42`
- Modify: `apps/api/src/outside-home/outside-home.controller.ts:17-18`
- Create: `apps/api/test/rate-limit.e2e-spec.ts`

**Interfaces:**
- Produces: `RATE_LIMIT_WINDOW_MS: number`, `RATE_LIMITS` (objeto com `global`, `publicSignals`, `syncUser`, `aiJob`, `silhueta`, `audio`, `importPreview`, `outsideHome`), `perMinute(limit: number): { default: { limit: number; ttl: number } }`, `RateLimitedException`, `RATE_LIMITED_MESSAGE`, `ApiThrottlerGuard`, `jwtSubject(authorization?: string): string | undefined`.

- [ ] **Step 1: Instalar a dependência**

Run: `pnpm --filter @nutri-plus/api add @nestjs/throttler@^6.5.0`
Expected: `@nestjs/throttler` em `apps/api/package.json` dependencies. Depois, confira as assinaturas em `apps/api/node_modules/@nestjs/throttler/dist/throttler.guard.d.ts` (`getTracker(req, context)` e `throwThrottlingException(context, detail)`); se `getTracker` não receber `context` nesta versão, use `ExecutionContext` guardado em `handleRequest` — mas na 6.x recebe.

- [ ] **Step 2: Escrever o teste unitário de `jwtSubject`**

`apps/api/src/common/rate-limit/api-throttler.guard.spec.ts`:

```ts
import { jwtSubject } from './api-throttler.guard';

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

describe('jwtSubject', () => {
  it('extrai o sub de um Bearer JWT sem verificar assinatura', () => {
    expect(jwtSubject(`Bearer ${fakeJwt({ sub: 'user-1' })}`)).toBe('user-1');
  });

  it('devolve undefined sem Bearer, com token malformado ou sem sub', () => {
    expect(jwtSubject(undefined)).toBeUndefined();
    expect(jwtSubject('Basic abc')).toBeUndefined();
    expect(jwtSubject('Bearer not-a-jwt')).toBeUndefined();
    expect(jwtSubject('Bearer a.b.c')).toBeUndefined();
    expect(jwtSubject(`Bearer ${fakeJwt({ email: 'x' })}`)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/api test -- api-throttler.guard`
Expected: FAIL (módulo não existe).

- [ ] **Step 4: Criar política, exceção e guard**

`apps/api/src/common/rate-limit/rate-limit.policy.ts`:

```ts
// Limites por minuto. A chave do contador é `user:<sub>` em rota autenticada e
// `ip:<req.ip>` em rota pública (ver ApiThrottlerGuard). Um só lugar para
// ajustar: a spec 2026-09-14-abuse-hardening-design.md traz os números.
export const RATE_LIMIT_WINDOW_MS = 60_000;

export const RATE_LIMITS = {
  global: 120,
  publicSignals: 5,
  syncUser: 20,
  aiJob: 10, // gerar/ajustar plano e retry
  silhueta: 5,
  audio: 5, // upload e transcrição
  importPreview: 10,
  outsideHome: 5,
} as const;

// Forma que o decorator @Throttle espera; 'default' é o nome do throttler
// registrado em AppModule.
export function perMinute(limit: number) {
  return { default: { limit, ttl: RATE_LIMIT_WINDOW_MS } };
}
```

`apps/api/src/common/rate-limit/rate-limited.exception.ts`:

```ts
import { HttpException, HttpStatus } from '@nestjs/common';

export const RATE_LIMITED_MESSAGE = 'Muitas solicitações. Aguarde um minuto e tente de novo.';

// O AllExceptionsFilter repassa `code` como campo extra do corpo.
export class RateLimitedException extends HttpException {
  constructor() {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'RATE_LIMITED', message: RATE_LIMITED_MESSAGE },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
```

`apps/api/src/common/rate-limit/api-throttler.guard.ts`:

```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { RateLimitedException } from './rate-limited.exception';

// Lê o `sub` de um JWT SEM verificar assinatura. Serve só para agrupar o
// contador de uma rota autenticada: um `sub` forjado leva 401 logo depois no
// SupabaseAuthGuard, então forjar não rende nada. Em rota pública o `sub` é
// ignorado de propósito — senão um Bearer aleatório burlaria o limite por IP.
export function jwtSubject(authorization?: string): string | undefined {
  if (!authorization?.startsWith('Bearer ')) return undefined;
  const parts = authorization.slice('Bearer '.length).split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>, context: ExecutionContext): Promise<string> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic) {
      const sub = jwtSubject(req.headers?.authorization);
      if (sub) return `user:${sub}`;
    }
    // `trust proxy` está ligado no bootstrap: req.ip é o IP que o Render
    // coloca em primeiro no X-Forwarded-For.
    return `ip:${req.ip ?? 'unknown'}`;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new RateLimitedException();
  }
}
```

- [ ] **Step 5: Rodar o unitário e ver passar**

Run: `pnpm --filter @nutri-plus/api test -- api-throttler.guard`
Expected: PASS (2 testes).

- [ ] **Step 6: Registrar módulo e guard**

Em `apps/api/src/app.module.ts`, adicionar os imports no topo:

```ts
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiThrottlerGuard } from './common/rate-limit/api-throttler.guard';
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from './common/rate-limit/rate-limit.policy';
```

No array `imports`, logo depois de `ConfigModule.forRoot(...)`:

```ts
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: RATE_LIMIT_WINDOW_MS, limit: RATE_LIMITS.global }],
    }),
```

Em `providers`, o throttler entra **antes** do `SupabaseAuthGuard`, e o comentário ganha a razão:

```ts
  // Global pipe/filter/guards are registered as providers (not imperatively in
  // main.ts) so any bootstrap of AppModule — including e2e Test modules —
  // inherits identical behavior. Guard order matters: ApiThrottlerGuard runs
  // first so a flood is rejected before any JWKS or database work;
  // SupabaseAuthGuard populates request.user before RolesGuard reads the role,
  // and SubscriptionGuard (billing) runs last since it depends on both.
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ApiThrottlerGuard },
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
```

`apps/api/src/health/health.controller.ts` inteiro:

```ts
import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';

// Fora do rate limit: o health check do Render nunca pode ser bloqueado.
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 7: Decorar as rotas**

Em cada controller, importar `import { Throttle } from '@nestjs/throttler';` e `import { RATE_LIMITS, perMinute } from '<caminho relativo>/common/rate-limit/rate-limit.policy';` e colocar o decorator logo abaixo do `@Post(...)`:

| Arquivo | Handler | Decorator |
|---|---|---|
| `meta/meta-signals.controller.ts` | `track` | `@Throttle(perMinute(RATE_LIMITS.publicSignals))` |
| `auth/auth.controller.ts` | `syncUser` | `@Throttle(perMinute(RATE_LIMITS.syncUser))` |
| `meal-generation/meal-generation.controller.ts` | `generateMealPlan` e `adjustMealPlan` | `@Throttle(perMinute(RATE_LIMITS.aiJob))` |
| `ai-jobs/ai-jobs.controller.ts` | `retry` | `@Throttle(perMinute(RATE_LIMITS.aiJob))` |
| `silhueta/silhueta.controller.ts` | `@Post()` (scan) | `@Throttle(perMinute(RATE_LIMITS.silhueta))` |
| `patients/audios/audios.controller.ts` | `create` e `transcribe` | `@Throttle(perMinute(RATE_LIMITS.audio))` |
| `patients/import/import.controller.ts` | `preview` | `@Throttle(perMinute(RATE_LIMITS.importPreview))` |
| `outside-home/outside-home.controller.ts` | `suggest` | `@Throttle(perMinute(RATE_LIMITS.outsideHome))` |

Exemplo (meta-signals):

```ts
  @Post()
  @Public()
  @Throttle(perMinute(RATE_LIMITS.publicSignals))
  @HttpCode(202)
  track(@Body() dto: MetaPublicSignalDto, @MetaCtx() ctx: MetaContext): MetaSignalResponse {
```

- [ ] **Step 8: Escrever o e2e do rate limit**

`apps/api/test/rate-limit.e2e-spec.ts`:

```ts
import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { RATE_LIMITS } from '../src/common/rate-limit/rate-limit.policy';
import { signSupabaseJwt, startJwksServer, JwksServer } from './helpers/jwks';

// O armazenamento do throttler é em memória e não é limpo entre testes: cada
// teste usa IPs/usuários próprios para não herdar contador de outro.
describe('Rate limit (e2e)', () => {
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
    // Espelha o bootstrap: sem isto req.ip é sempre 127.0.0.1 e o X-Forwarded-For
    // dos testes seria ignorado.
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  const signal = (ip: string, extra: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .post('/v1/signals')
      .set('X-Forwarded-For', ip)
      .set(extra)
      .send({ name: 'CompleteRegistration', email: 'a@x.com' });

  it('rota pública: aceita o limite e rejeita a seguinte com 429 RATE_LIMITED', async () => {
    for (let i = 0; i < RATE_LIMITS.publicSignals; i++) {
      await signal('10.0.0.1').expect(202);
    }
    const res = await signal('10.0.0.1').expect(429);
    expect(res.body).toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Muitas solicitações. Aguarde um minuto e tente de novo.',
    });
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('rota pública: outro IP tem contador próprio', async () => {
    await signal('10.0.0.2').expect(202);
  });

  it('rota pública: Bearer forjado não escapa do limite por IP', async () => {
    for (let i = 0; i < RATE_LIMITS.publicSignals; i++) {
      await signal('10.0.0.3').expect(202);
    }
    const forged = signSupabaseJwt({ sub: 'ghost', email: 'g@x.com', name: 'G' });
    await signal('10.0.0.3', { Authorization: `Bearer ${forged}` }).expect(429);
  });

  it('health fica fora do limite', async () => {
    for (let i = 0; i < RATE_LIMITS.global + 10; i++) {
      await request(app.getHttpServer()).get('/health').set('X-Forwarded-For', '10.0.0.4').expect(200);
    }
  });

  it('rota autenticada: contador por usuário, não por IP', async () => {
    const a = signSupabaseJwt({ sub: 'rl-user-a', email: 'a@rl.com', name: 'A' });
    const b = signSupabaseJwt({ sub: 'rl-user-b', email: 'b@rl.com', name: 'B' });
    const sync = (token: string) =>
      request(app.getHttpServer())
        .post('/v1/auth/sync-user')
        .set('X-Forwarded-For', '10.0.0.5')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: UserRole.NUTRITIONIST });
    for (let i = 0; i < RATE_LIMITS.syncUser; i++) {
      await sync(a).expect(200);
    }
    await sync(a).expect(429);
    await sync(b).expect(200);
  });
});
```

- [ ] **Step 9: Rodar unitários e e2e**

Run: `pnpm --filter @nutri-plus/api test`
Expected: PASS (suite inteira; nenhum spec existente constrói guards do throttler).

Run: `pnpm --filter @nutri-plus/api test:e2e -- rate-limit`
Expected: PASS (5 testes). Se o teste de `sync-user` falhar com 401, confira que o JWKS foi iniciado antes de importar o AppModule, como em `auth.e2e-spec.ts`.

Run: `pnpm --filter @nutri-plus/api test:e2e`
Expected: PASS. Nenhum e2e existente faz mais de 120 requisições do mesmo IP num minuto.

- [ ] **Step 10: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/common/rate-limit apps/api/src/app.module.ts apps/api/src/health/health.controller.ts apps/api/src/meta/meta-signals.controller.ts apps/api/src/auth/auth.controller.ts apps/api/src/meal-generation/meal-generation.controller.ts apps/api/src/ai-jobs/ai-jobs.controller.ts apps/api/src/silhueta/silhueta.controller.ts apps/api/src/patients/audios/audios.controller.ts apps/api/src/patients/import/import.controller.ts apps/api/src/outside-home/outside-home.controller.ts apps/api/test/rate-limit.e2e-spec.ts
git commit -m "feat(api): rate limit por usuário/IP com limites por rota"
```

---

### Task 2: Remover o proxy público de login

**Files:**
- Delete: `apps/api/src/auth/dto/login.dto.ts`
- Modify: `apps/api/src/auth/auth.controller.ts:1-21`
- Modify: `apps/api/src/auth/auth.service.ts:1-25,52-86`
- Modify: `apps/api/src/auth/auth.service.spec.ts:1-21`
- Modify: `apps/api/test/auth.e2e-spec.ts` (novo teste)

**Interfaces:**
- Produces: `AuthService` passa a ter construtor `(users: UsersService)`; não há mais `LoginDto`/`LoginResponse`.

- [ ] **Step 1: Escrever o e2e que prova a remoção**

Em `apps/api/test/auth.e2e-spec.ts`, dentro do `describe('Auth (e2e)')`, adicionar:

```ts
  it('não expõe proxy de login: POST /v1/auth/login responde 404', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'a@x.com', password: 'secret' })
      .expect(404);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/api test:e2e -- auth.e2e`
Expected: FAIL no teste novo (responde 401 ou 502, não 404).

- [ ] **Step 3: Remover a rota, o serviço e o DTO**

`apps/api/src/auth/auth.controller.ts` inteiro:

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthContext, LocalUser } from './types/auth-context';
import { SyncUserDto } from './dto/sync-user.dto';
import { RATE_LIMITS, perMinute } from '../common/rate-limit/rate-limit.policy';

// Login, cadastro e reset de senha são do Supabase (SDK no web e no app).
// A API não tem proxy de senha: ele concentraria tentativas no IP único do
// Render e não tinha chamador nenhum.
@ApiTags('auth')
@ApiBearerAuth()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('sync-user')
  @Throttle(perMinute(RATE_LIMITS.syncUser))
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

`apps/api/src/auth/auth.service.ts` inteiro:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
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
      throw new ConflictException(
        'User not synced. Call POST /v1/auth/sync-user first.',
      );
    }
    return ctx.user;
  }
}
```

Apagar `apps/api/src/auth/dto/login.dto.ts`. Em `apps/api/src/auth/auth.service.spec.ts`, remover `import { ConfigService } from '@nestjs/config';` e trocar a construção por:

```ts
    service = new AuthService(users as unknown as UsersService);
```

- [ ] **Step 4: Rodar unitários e e2e**

Run: `pnpm --filter @nutri-plus/api test -- auth`
Expected: PASS.

Run: `pnpm --filter @nutri-plus/api test:e2e -- auth.e2e`
Expected: PASS incluindo o 404.

Run: `pnpm --filter @nutri-plus/api build`
Expected: compila (nenhuma referência restante a `LoginDto`; confirme com `grep -rn "login.dto\|LoginDto" apps/api/src` vazio).

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src/auth apps/api/test/auth.e2e-spec.ts
git commit -m "feat(api): remove proxy público de login"
```

---

### Task 3: Política e serviço de teto diário de IA

**Files:**
- Modify: `apps/api/src/billing/plan-policy.ts:6-18` (adicionar `saoPauloDayStart` ao lado de `saoPauloMonthStart`)
- Create: `apps/api/src/billing/plan-policy.spec.ts`
- Create: `apps/api/src/ai/ai-usage-cap.policy.ts`
- Create: `apps/api/src/ai/ai-daily-cap.exception.ts`
- Create: `apps/api/src/ai/ai-usage-cap.service.ts`
- Create: `apps/api/src/ai/ai-usage-cap.service.spec.ts`
- Modify: `apps/api/src/ai/ai.module.ts`

**Interfaces:**
- Produces: `saoPauloDayStart(now: Date): Date`; `AI_DAILY_CAPS = { nutritionist: 60, patient: 10 }`; `AI_DAILY_CAP_MESSAGE`; `AiCapScope = 'nutritionist' | 'patient'`; `AiDailyCapExceededException(scope)`; `AiUsageCapService.assertWithinDailyCaps(owner: { nutritionistId?: string; patientId?: string; type: AIInteractionType }): Promise<void>`.

- [ ] **Step 1: Teste de `saoPauloDayStart`**

`apps/api/src/billing/plan-policy.spec.ts`:

```ts
import { saoPauloDayStart, saoPauloMonthStart } from './plan-policy';

describe('saoPauloDayStart', () => {
  it('00:00 em São Paulo é 03:00 UTC do mesmo dia', () => {
    expect(saoPauloDayStart(new Date('2026-09-11T15:00:00Z')).toISOString()).toBe('2026-09-11T03:00:00.000Z');
  });

  it('antes das 03:00 UTC ainda é o dia anterior em São Paulo', () => {
    expect(saoPauloDayStart(new Date('2026-09-11T02:59:59Z')).toISOString()).toBe('2026-09-10T03:00:00.000Z');
  });

  it('exatamente 03:00 UTC já é o dia corrente', () => {
    expect(saoPauloDayStart(new Date('2026-09-11T03:00:00Z')).toISOString()).toBe('2026-09-11T03:00:00.000Z');
  });
});

describe('saoPauloMonthStart', () => {
  it('primeiro dia do mês às 03:00 UTC', () => {
    expect(saoPauloMonthStart(new Date('2026-09-11T15:00:00Z')).toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/api test -- plan-policy`
Expected: FAIL (`saoPauloDayStart` não exportado).

- [ ] **Step 3: Implementar `saoPauloDayStart`**

Em `apps/api/src/billing/plan-policy.ts`, logo depois de `saoPauloMonthStart`:

```ts
// Início do dia em America/Sao_Paulo (UTC-3, sem DST) expresso em instante UTC.
// Usado pelo teto diário de IA (AiUsageCapService).
export function saoPauloDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  // 00:00 em São Paulo == 03:00 UTC.
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), 3, 0, 0));
}
```

Run: `pnpm --filter @nutri-plus/api test -- plan-policy`
Expected: PASS (4 testes).

- [ ] **Step 4: Teste do serviço de teto**

`apps/api/src/ai/ai-usage-cap.service.spec.ts`:

```ts
import { AIInteractionType } from '../generated/prisma/client';
import { AiUsageCapService } from './ai-usage-cap.service';
import { AiDailyCapExceededException } from './ai-daily-cap.exception';
import { AI_DAILY_CAPS } from './ai-usage-cap.policy';
import { saoPauloDayStart } from '../billing/plan-policy';

// Prisma mockado: aIInteraction.count responde por chamada, na ordem
// (nutricionista primeiro, paciente depois).
function makeService(counts: number[]) {
  const count = jest.fn();
  counts.forEach((n) => count.mockResolvedValueOnce(n));
  const prisma = { aIInteraction: { count } } as any;
  return { svc: new AiUsageCapService(prisma), count };
}

describe('AiUsageCapService.assertWithinDailyCaps', () => {
  it('abaixo do teto do nutricionista, passa e conta desde o início do dia em São Paulo', async () => {
    const { svc, count } = makeService([AI_DAILY_CAPS.nutritionist - 1]);
    await expect(
      svc.assertWithinDailyCaps({ nutritionistId: 'n1', type: AIInteractionType.MEAL_PLAN_GENERATION }),
    ).resolves.toBeUndefined();
    const where = count.mock.calls[0][0].where;
    expect(where.nutritionistId).toBe('n1');
    expect(where.type).toBeUndefined(); // todos os tipos
    expect(where.success).toBeUndefined(); // sucesso e falha
    expect(where.createdAt.gte.getTime()).toBe(saoPauloDayStart(new Date()).getTime());
  });

  it('no teto do nutricionista, lança 429 AI_DAILY_CAP_EXCEEDED com scope nutritionist', async () => {
    const { svc } = makeService([AI_DAILY_CAPS.nutritionist]);
    const err = await svc
      .assertWithinDailyCaps({ nutritionistId: 'n1', type: AIInteractionType.MEAL_PLAN_ADJUSTMENT })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AiDailyCapExceededException);
    expect(err.getStatus()).toBe(429);
    expect(err.getResponse()).toMatchObject({ code: 'AI_DAILY_CAP_EXCEEDED', scope: 'nutritionist' });
    expect(err.message).toBe('Limite diário de IA atingido. Tente amanhã.');
  });

  it('paciente no Fora de casa: teto próprio de 10 por dia', async () => {
    const { svc, count } = makeService([0, AI_DAILY_CAPS.patient]);
    const err = await svc
      .assertWithinDailyCaps({ nutritionistId: 'n1', patientId: 'p1', type: AIInteractionType.OUTSIDE_HOME_SUGGESTION })
      .catch((e) => e);
    expect(err.getResponse()).toMatchObject({ scope: 'patient' });
    const where = count.mock.calls[1][0].where;
    expect(where).toMatchObject({ patientId: 'p1', type: AIInteractionType.OUTSIDE_HOME_SUGGESTION });
  });

  it('paciente em outro tipo de chamada não tem teto próprio', async () => {
    const { svc, count } = makeService([0]);
    await svc.assertWithinDailyCaps({ nutritionistId: 'n1', patientId: 'p1', type: AIInteractionType.MEAL_PLAN_GENERATION });
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('sem dono conhecido não consulta o banco', async () => {
    const { svc, count } = makeService([]);
    await svc.assertWithinDailyCaps({ type: AIInteractionType.COLUMN_MAPPING });
    expect(count).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/api test -- ai-usage-cap`
Expected: FAIL (módulos não existem).

- [ ] **Step 6: Implementar política, exceção e serviço**

`apps/api/src/ai/ai-usage-cap.policy.ts`:

```ts
// Teto diário de IA (ver CONTEXT.md): rede de segurança abaixo das cotas
// mensais de plano. Conta sucesso e falha do dia em America/Sao_Paulo.
export const AI_DAILY_CAPS = {
  nutritionist: 60, // todos os tipos, por nutricionista
  patient: 10, // OUTSIDE_HOME_SUGGESTION, por paciente
} as const;

export const AI_DAILY_CAP_MESSAGE = 'Limite diário de IA atingido. Tente amanhã.';
```

`apps/api/src/ai/ai-daily-cap.exception.ts`:

```ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { AI_DAILY_CAP_MESSAGE } from './ai-usage-cap.policy';

export type AiCapScope = 'nutritionist' | 'patient';

// 429 e não 402: não é questão de plano, é limite do dia. O runner de jobs
// grava `message` no campo de erro do job, por isso a mensagem é em português.
export class AiDailyCapExceededException extends HttpException {
  constructor(readonly scope: AiCapScope) {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'AI_DAILY_CAP_EXCEEDED', scope, message: AI_DAILY_CAP_MESSAGE },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
```

`apps/api/src/ai/ai-usage-cap.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIInteractionType } from '../generated/prisma/client';
import { saoPauloDayStart } from '../billing/plan-policy';
import { AI_DAILY_CAPS } from './ai-usage-cap.policy';
import { AiDailyCapExceededException } from './ai-daily-cap.exception';

export interface AiCallOwner {
  nutritionistId?: string;
  patientId?: string;
  type: AIInteractionType;
}

// Consultado pelo OpenAIProvider antes de QUALQUER chamada. Conta linhas de
// AIInteraction (sucesso e falha) do dia corrente em São Paulo, então repetir
// uma chamada quebrada não é grátis. Não há contador a debitar: a própria
// auditoria é a fonte.
@Injectable()
export class AiUsageCapService {
  private readonly logger = new Logger(AiUsageCapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assertWithinDailyCaps(owner: AiCallOwner): Promise<void> {
    if (!owner.nutritionistId && !owner.patientId) {
      this.logger.warn(`AI call without owner (type=${owner.type}); daily cap not applied`);
      return;
    }
    const since = saoPauloDayStart(new Date());

    if (owner.nutritionistId) {
      const used = await this.prisma.aIInteraction.count({
        where: { nutritionistId: owner.nutritionistId, createdAt: { gte: since } },
      });
      if (used >= AI_DAILY_CAPS.nutritionist) throw new AiDailyCapExceededException('nutritionist');
    }

    if (owner.patientId && owner.type === AIInteractionType.OUTSIDE_HOME_SUGGESTION) {
      const used = await this.prisma.aIInteraction.count({
        where: {
          patientId: owner.patientId,
          type: AIInteractionType.OUTSIDE_HOME_SUGGESTION,
          createdAt: { gte: since },
        },
      });
      if (used >= AI_DAILY_CAPS.patient) throw new AiDailyCapExceededException('patient');
    }
  }
}
```

`apps/api/src/ai/ai.module.ts` inteiro:

```ts
import { Module } from '@nestjs/common';
import { OpenAIProvider } from './openai.provider';
import { AiInteractionsService } from './ai-interactions.service';
import { AiUsageCapService } from './ai-usage-cap.service';

@Module({
  providers: [OpenAIProvider, AiInteractionsService, AiUsageCapService],
  exports: [OpenAIProvider],
})
export class AiModule {}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @nutri-plus/api test -- ai-usage-cap plan-policy`
Expected: PASS (9 testes).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/billing/plan-policy.ts apps/api/src/billing/plan-policy.spec.ts apps/api/src/ai/ai-usage-cap.policy.ts apps/api/src/ai/ai-daily-cap.exception.ts apps/api/src/ai/ai-usage-cap.service.ts apps/api/src/ai/ai-usage-cap.service.spec.ts apps/api/src/ai/ai.module.ts
git commit -m "feat(api): teto diário de IA por nutricionista e por paciente"
```

---

### Task 4: Aplicar o teto no gateway da OpenAI

**Files:**
- Modify: `apps/api/src/ai/openai.provider.ts:28-47` (construtor) e início de `generateStructured` (`:48-52`) e de `transcribeAudio` (`:141-148`)
- Modify: `apps/api/src/ai/openai.provider.spec.ts:19-31` (`makeProvider`) + novos testes
- Modify: `apps/api/src/ai-jobs/ai-jobs.service.spec.ts` (novo teste ao lado de `'falha grava FAILED com a mensagem'`, linha 104)

**Interfaces:**
- Consumes: `AiUsageCapService.assertWithinDailyCaps`, `AiDailyCapExceededException`.
- Produces: `OpenAIProvider` construtor `(config, interactions, caps: AiUsageCapService)`.

- [ ] **Step 1: Atualizar `makeProvider` e escrever os testes**

Em `apps/api/src/ai/openai.provider.spec.ts`, trocar `makeProvider` por:

```ts
function makeProvider(env: Record<string, string> = ENV) {
  const config = {
    getOrThrow: (key: string) => {
      if (env[key] === undefined) throw new Error(`missing ${key}`);
      return env[key];
    },
  } as any;
  const interactions = mockDeep<AiInteractionsService>();
  const caps = { assertWithinDailyCaps: jest.fn().mockResolvedValue(undefined) };
  const provider = new OpenAIProvider(config, interactions, caps as any);
  const create = jest.fn();
  (provider as any).client = { chat: { completions: { create } } };
  return { provider, interactions, caps, create };
}
```

Adicionar ao final do `describe('OpenAIProvider.generateStructured')`:

```ts
  it('consulta o teto diário com o dono da chamada antes de chamar a OpenAI', async () => {
    const { provider, caps, create } = makeProvider();
    create.mockResolvedValue(completion(JSON.stringify({ title: 'Plan' })));
    await provider.generateStructured({ ...baseOpts, nutritionistId: 'n1' });
    expect(caps.assertWithinDailyCaps).toHaveBeenCalledWith({
      nutritionistId: 'n1',
      patientId: 'p1',
      type: AIInteractionType.MEAL_PLAN_GENERATION,
    });
    expect(caps.assertWithinDailyCaps.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
  });

  it('com o teto estourado não chama a OpenAI nem grava interação', async () => {
    const { provider, caps, create, interactions } = makeProvider();
    caps.assertWithinDailyCaps.mockRejectedValue(new AiDailyCapExceededException('nutritionist'));
    await expect(provider.generateStructured({ ...baseOpts, nutritionistId: 'n1' })).rejects.toBeInstanceOf(
      AiDailyCapExceededException,
    );
    expect(create).not.toHaveBeenCalled();
    expect(interactions.record).not.toHaveBeenCalled();
  });
```

Importar no topo: `import { AiDailyCapExceededException } from './ai-daily-cap.exception';`.

No `describe` de `transcribeAudio` já existente no arquivo (localize-o; o mock do client usa `audio.transcriptions.create`), adicionar:

```ts
  it('com o teto estourado não transcreve nem grava interação', async () => {
    const { provider, caps, interactions } = makeProvider();
    const create = jest.fn();
    (provider as any).client = { audio: { transcriptions: { create } } };
    caps.assertWithinDailyCaps.mockRejectedValue(new AiDailyCapExceededException('nutritionist'));
    await expect(
      provider.transcribeAudio(Buffer.from('x'), 'a.m4a', { patientId: 'p1', nutritionistId: 'n1', durationSec: 10 }),
    ).rejects.toBeInstanceOf(AiDailyCapExceededException);
    expect(create).not.toHaveBeenCalled();
    expect(interactions.record).not.toHaveBeenCalled();
    expect(caps.assertWithinDailyCaps).toHaveBeenCalledWith({
      nutritionistId: 'n1',
      patientId: 'p1',
      type: AIInteractionType.CONSULTATION_TRANSCRIPTION,
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/api test -- openai.provider`
Expected: FAIL (construtor com 2 argumentos; `caps` nunca chamado).

- [ ] **Step 3: Injetar e consultar o teto no provider**

Em `apps/api/src/ai/openai.provider.ts`:

Import: `import { AiUsageCapService } from './ai-usage-cap.service';`

Construtor:

```ts
  constructor(
    config: ConfigService,
    private readonly interactions: AiInteractionsService,
    // Teto diário: o gateway garante que a checagem acontece antes de qualquer
    // chamada; os números moram em ai-usage-cap.policy.ts. É a exceção
    // deliberada ao "mecanismo-só": um ponto cobre todo tipo de chamada.
    private readonly caps: AiUsageCapService,
  ) {
```

Primeira linha do corpo de `generateStructured`, antes de `const model = ...`:

```ts
    await this.caps.assertWithinDailyCaps({
      nutritionistId: opts.nutritionistId,
      patientId: opts.patientId,
      type: opts.type,
    });
```

Primeira linha do corpo de `transcribeAudio`, antes de `const model = this.transcribeModel;`:

```ts
    await this.caps.assertWithinDailyCaps({
      nutritionistId: opts.nutritionistId,
      patientId: opts.patientId,
      type: AIInteractionType.CONSULTATION_TRANSCRIPTION,
    });
```

- [ ] **Step 4: Rodar o spec do provider**

Run: `pnpm --filter @nutri-plus/api test -- openai.provider`
Expected: PASS.

- [ ] **Step 5: Teste do runner de jobs**

Em `apps/api/src/ai-jobs/ai-jobs.service.spec.ts`, importar `import { AiDailyCapExceededException } from '../ai/ai-daily-cap.exception';` e adicionar, logo após o teste `'falha grava FAILED com a mensagem'`:

```ts
  it('teto diário de IA vira FAILED com a mensagem em português', async () => {
    const { svc, prisma, generation } = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'PENDING',
      nutritionistId: 'n1', patientId: 'p1', input: {},
    });
    generation.generate.mockRejectedValue(new AiDailyCapExceededException('nutritionist'));
    await svc.runJob('j1');
    const last = prisma.aiJob.update.mock.calls.at(-1)![0];
    expect(last.data.status).toBe('FAILED');
    expect(last.data.error).toBe('Limite diário de IA atingido. Tente amanhã.');
  });
```

Run: `pnpm --filter @nutri-plus/api test -- ai-jobs.service`
Expected: PASS sem mudar o runner (o `catch` já grava `err.message`).

- [ ] **Step 6: Suite completa**

Run: `pnpm --filter @nutri-plus/api test`
Expected: PASS. Se algum spec construir `new OpenAIProvider(` com 2 argumentos (`grep -rn "new OpenAIProvider(" apps/api/src`), adicione o terceiro argumento `{ assertWithinDailyCaps: jest.fn().mockResolvedValue(undefined) } as any`.

Run: `pnpm --filter @nutri-plus/api test:e2e`
Expected: PASS (`meal-generation.e2e-spec.ts` mocka a OpenAI acima do provider ou o próprio SDK; o teto não dispara porque o banco de teste está vazio).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/ai/openai.provider.ts apps/api/src/ai/openai.provider.spec.ts apps/api/src/ai-jobs/ai-jobs.service.spec.ts
git commit -m "feat(api): gateway da OpenAI aplica o teto diário antes de cada chamada"
```

---

### Task 5: Web mostra 429 de forma amigável

**Files:**
- Create: `apps/web/src/lib/api/rate-limit-errors.ts`
- Create: `apps/web/src/lib/api/rate-limit-errors.test.ts`
- Modify: `apps/web/src/app/providers.tsx`

**Interfaces:**
- Produces: `rateLimitMessageFrom(err: unknown): string | null`.

- [ ] **Step 1: Teste**

`apps/web/src/lib/api/rate-limit-errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { rateLimitMessageFrom } from './rate-limit-errors';

describe('rateLimitMessageFrom', () => {
  it('RATE_LIMITED vira a mensagem de aguardar', () => {
    const err = new ApiError(429, { statusCode: 429, code: 'RATE_LIMITED' });
    expect(rateLimitMessageFrom(err)).toBe('Muitas solicitações. Aguarde um minuto e tente de novo.');
  });

  it('AI_DAILY_CAP_EXCEEDED vira a mensagem de limite diário', () => {
    const err = new ApiError(429, { code: 'AI_DAILY_CAP_EXCEEDED', scope: 'nutritionist' });
    expect(rateLimitMessageFrom(err)).toBe('Limite diário de IA atingido. Tente amanhã.');
  });

  it('429 sem code conhecido cai na mensagem de aguardar', () => {
    expect(rateLimitMessageFrom(new ApiError(429, null))).toBe('Muitas solicitações. Aguarde um minuto e tente de novo.');
  });

  it('ignora não-429 e não-ApiError', () => {
    expect(rateLimitMessageFrom(new ApiError(402, { code: 'READ_ONLY' }))).toBeNull();
    expect(rateLimitMessageFrom(new Error('x'))).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/web test -- rate-limit-errors`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`apps/web/src/lib/api/rate-limit-errors.ts`:

```ts
import { ApiError } from '@/lib/api/client';

const MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'Muitas solicitações. Aguarde um minuto e tente de novo.',
  AI_DAILY_CAP_EXCEEDED: 'Limite diário de IA atingido. Tente amanhã.',
};

/** 429 da API → mensagem pt-BR por `code`; null para qualquer outro erro. */
export function rateLimitMessageFrom(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 429) return null;
  const code = (err.body as { code?: string } | null)?.code;
  return (code && MESSAGES[code]) || MESSAGES.RATE_LIMITED;
}
```

`apps/web/src/app/providers.tsx` inteiro:

```tsx
'use client';

import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { billingErrorFrom } from '@/lib/api/billing-errors';
import { rateLimitMessageFrom } from '@/lib/api/rate-limit-errors';
import { emitBilling } from '@/lib/billing/billing-events';

function handle(err: unknown) {
  const be = billingErrorFrom(err);
  if (be) emitBilling(be.code, be.feature);
  // Rate limit e teto diário de IA: aviso único, no lugar do erro genérico de
  // cada tela. O <Toaster> vive no layout autenticado.
  const rl = rateLimitMessageFrom(err);
  if (rl) toast.error(rl);
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handle }),
        mutationCache: new MutationCache({ onError: handle }),
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @nutri-plus/web test -- rate-limit-errors`
Expected: PASS (4 testes).

Run: `pnpm --filter @nutri-plus/web lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api/rate-limit-errors.ts apps/web/src/lib/api/rate-limit-errors.test.ts apps/web/src/app/providers.tsx
git commit -m "feat(web): toast amigável para 429 (rate limit e teto diário de IA)"
```

---

### Task 6: Route handler do gate de cadastro

**Files:**
- Create: `apps/web/src/app/api/signup-gate/route.ts`
- Create: `apps/web/src/app/api/signup-gate/route.test.ts`

**Interfaces:**
- Produces: `POST /api/signup-gate` com corpo `{ token: string }` → 204 | 400 `{ code: 'CAPTCHA_TOKEN_MISSING' }` | 403 `{ code: 'CAPTCHA_FAILED' }` | 503 `{ code: 'CAPTCHA_NOT_CONFIGURED' }`.

- [ ] **Step 1: Teste**

`apps/web/src/app/api/signup-gate/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();

import { POST } from './route';

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3001/api/signup-gate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-1');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('POST /api/signup-gate', () => {
  it('204 quando a Cloudflare confirma o token; manda secret, token e IP do cliente', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    const res = await POST(post({ token: 'tok-1' }, { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }));
    expect(res.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const sent = init.body as URLSearchParams;
    expect(sent.get('secret')).toBe('secret-1');
    expect(sent.get('response')).toBe('tok-1');
    expect(sent.get('remoteip')).toBe('203.0.113.7');
  });

  it('403 CAPTCHA_FAILED quando a Cloudflare recusa', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }) });
    const res = await POST(post({ token: 'tok-1' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: 'CAPTCHA_FAILED' });
  });

  it('403 CAPTCHA_FAILED quando a Cloudflare está fora (nunca aprova por falha)', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const res = await POST(post({ token: 'tok-1' }));
    expect(res.status).toBe(403);
  });

  it('400 sem token ou com corpo inválido', async () => {
    expect((await POST(post({}))).status).toBe(400);
    expect((await POST(post('not json'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('503 CAPTCHA_NOT_CONFIGURED sem chave secreta (falha fechado)', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    const res = await POST(post({ token: 'tok-1' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: 'CAPTCHA_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/web test -- signup-gate`
Expected: FAIL (route não existe).

- [ ] **Step 3: Implementar**

`apps/web/src/app/api/signup-gate/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Gate de cadastro (ver CONTEXT.md): verifica no servidor o token do Turnstile
 * antes de o formulário chamar o signUp do Supabase. A chave secreta nunca sai
 * daqui. Sem chave configurada, falha fechado (503) para uma produção mal
 * configurada não ficar desprotegida em silêncio; em dev o formulário nem
 * chama esta rota, porque a site key pública não está definida.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ code: 'CAPTCHA_NOT_CONFIGURED' }, { status: 503 });
  }

  let token: unknown;
  try {
    token = ((await request.json()) as { token?: unknown } | null)?.token;
  } catch {
    token = undefined;
  }
  if (typeof token !== 'string' || token.length === 0) {
    return NextResponse.json({ code: 'CAPTCHA_TOKEN_MISSING' }, { status: 400 });
  }

  const body = new URLSearchParams({ secret, response: token });
  // O Vercel preenche x-forwarded-for; o primeiro IP é o do cliente.
  const remoteip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (remoteip) body.set('remoteip', remoteip);

  let success = false;
  try {
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body });
    const data = res.ok ? ((await res.json()) as { success?: boolean }) : null;
    success = data?.success === true;
  } catch {
    success = false;
  }

  if (!success) {
    return NextResponse.json({ code: 'CAPTCHA_FAILED' }, { status: 403 });
  }
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @nutri-plus/web test -- signup-gate`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/signup-gate
git commit -m "feat(web): route handler que verifica o token do Turnstile"
```

---

### Task 7: Turnstile no formulário de cadastro

**Files:**
- Create: `apps/web/src/lib/auth/signup-gate.ts`
- Modify: `apps/web/src/components/auth/signup-form.tsx`
- Modify: `apps/web/src/components/auth/signup-form.test.tsx`
- Modify: `apps/web/.env.example`

**Interfaces:**
- Consumes: `POST /api/signup-gate` (Task 6).
- Produces: `turnstileSiteKey(): string | undefined`; `verifySignupGate(token: string): Promise<'ok' | 'captcha_failed' | 'error'>`; `CAPTCHA_FAILED_MESSAGE`.

- [ ] **Step 1: Instalar o widget**

Run: `pnpm --filter @nutri-plus/web add @marsidev/react-turnstile@^1.6.0`
Expected: dependência adicionada. Confira em `apps/web/node_modules/@marsidev/react-turnstile/dist/index.d.ts` os nomes `Turnstile`, `TurnstileInstance` e as props `siteKey`, `onSuccess`, `onExpire`, `onError`, `options.appearance`.

- [ ] **Step 2: Escrever os testes do formulário**

Em `apps/web/src/components/auth/signup-form.test.tsx`, adicionar os mocks abaixo **antes** do `import { SignupForm }`:

```ts
const verifySignupGate = vi.fn();
let currentSiteKey: string | undefined;
vi.mock('@/lib/auth/signup-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/signup-gate')>();
  return {
    ...actual,
    turnstileSiteKey: () => currentSiteKey,
    verifySignupGate: (...a: unknown[]) => verifySignupGate(...a),
  };
});
// Widget falso: um botão que entrega o token, como o Turnstile real faria.
vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({ onSuccess }: { onSuccess: (t: string) => void }) => (
    <button type="button" onClick={() => onSuccess('tok-1')}>
      resolver captcha
    </button>
  ),
}));
```

No `beforeEach`, adicionar `verifySignupGate.mockReset(); currentSiteKey = undefined;`.

Adicionar ao final do `describe('SignupForm')`:

```tsx
  it('sem site key não renderiza o widget nem chama o gate', async () => {
    signUp.mockResolvedValue({ error: null });
    render(<SignupForm />);
    expect(screen.queryByText(/resolver captcha/i)).not.toBeInTheDocument();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(verifySignupGate).not.toHaveBeenCalled();
  });

  it('com site key o botão só libera depois do token, e o gate roda antes do signUp', async () => {
    currentSiteKey = 'site-1';
    verifySignupGate.mockResolvedValue('ok');
    signUp.mockResolvedValue({ error: null });
    render(<SignupForm />);
    await fillValid();
    expect(screen.getByRole('button', { name: /criar conta/i })).toBeDisabled();
    await userEvent.click(screen.getByText(/resolver captcha/i));
    expect(screen.getByRole('button', { name: /criar conta/i })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(verifySignupGate).toHaveBeenCalledWith('tok-1');
    expect(verifySignupGate.mock.invocationCallOrder[0]).toBeLessThan(signUp.mock.invocationCallOrder[0]);
    expect(trackCompleteRegistration).toHaveBeenCalledWith('ana@clinica.com', 'Dra. Ana');
  });

  it('gate reprovado: mostra a mensagem de robô e não cria conta nem dispara conversão', async () => {
    currentSiteKey = 'site-1';
    verifySignupGate.mockResolvedValue('captcha_failed');
    render(<SignupForm />);
    await fillValid();
    await userEvent.click(screen.getByText(/resolver captcha/i));
    await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    expect(
      await screen.findByText('Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.'),
    ).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
    expect(trackCompleteRegistration).not.toHaveBeenCalled();
    // Token consumido: o botão volta a ficar bloqueado até novo desafio.
    expect(screen.getByRole('button', { name: /criar conta/i })).toBeDisabled();
  });

  it('gate indisponível: mensagem genérica e nenhuma conta criada', async () => {
    currentSiteKey = 'site-1';
    verifySignupGate.mockResolvedValue('error');
    render(<SignupForm />);
    await fillValid();
    await userEvent.click(screen.getByText(/resolver captcha/i));
    await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    expect(await screen.findByText(/algo deu errado/i)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/web test -- signup-form`
Expected: FAIL nos 4 testes novos (módulo `@/lib/auth/signup-gate` não existe).

- [ ] **Step 4: Implementar o cliente do gate e o formulário**

`apps/web/src/lib/auth/signup-gate.ts`:

```ts
export const CAPTCHA_FAILED_MESSAGE =
  'Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.';

/** Site key pública do Turnstile. Ausente em dev/testes: o gate fica desligado. */
export function turnstileSiteKey(): string | undefined {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined;
}

export type SignupGateResult = 'ok' | 'captcha_failed' | 'error';

/** Verifica o token no servidor (route handler) antes do signUp. */
export async function verifySignupGate(token: string): Promise<SignupGateResult> {
  try {
    const res = await fetch('/api/signup-gate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (res.status === 204) return 'ok';
    if (res.status === 403) return 'captcha_failed';
    return 'error';
  } catch {
    return 'error';
  }
}
```

Em `apps/web/src/components/auth/signup-form.tsx`:

Imports novos (após os existentes):

```tsx
import { useRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { CAPTCHA_FAILED_MESSAGE, turnstileSiteKey, verifySignupGate } from '@/lib/auth/signup-gate';
```

(Junte `useRef` ao `import { useState } from 'react';` existente.)

Dentro do componente, após `const [formError, setFormError] = useState<string | null>(null);`:

```tsx
  // Gate de cadastro (CONTEXT.md): sem site key o widget não existe e o fluxo é
  // o de sempre. Com site key, o botão só libera com token, e o token é
  // verificado no servidor antes do signUp.
  const siteKey = turnstileSiteKey();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  function resetCaptcha() {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  }
```

No início de `onSubmit`, logo após `setFormError(null);`:

```tsx
    if (siteKey) {
      const gate = await verifySignupGate(captchaToken ?? '');
      // Token do Turnstile é de uso único: qualquer resultado exige novo desafio.
      resetCaptcha();
      if (gate === 'captcha_failed') {
        setFormError(CAPTCHA_FAILED_MESSAGE);
        return;
      }
      if (gate === 'error') {
        setFormError(mapAuthError(null));
        return;
      }
    }
```

No JSX, entre o campo `confirmPassword` e `{formError && ...}`:

```tsx
          {siteKey && (
            <Turnstile
              ref={turnstileRef}
              siteKey={siteKey}
              options={{ appearance: 'interaction-only', language: 'pt-BR' }}
              onSuccess={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
              onError={() => setCaptchaToken(null)}
            />
          )}
```

E no botão:

```tsx
            disabled={form.formState.isSubmitting || (Boolean(siteKey) && !captchaToken)}
```

Em `apps/web/.env.example`, acrescentar ao final:

```bash
# Gate de cadastro (Cloudflare Turnstile). Deixe as duas vazias localmente: o
# formulário não renderiza o widget e não chama o gate. Em produção, as duas
# são obrigatórias — sem a secreta o gate falha fechado (503).
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

- [ ] **Step 5: Rodar**

Run: `pnpm --filter @nutri-plus/web test -- signup-form`
Expected: PASS (testes antigos e os 4 novos).

Run: `pnpm --filter @nutri-plus/web test` e `pnpm --filter @nutri-plus/web lint`
Expected: PASS, sem erros de lint.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/.env.example apps/web/src/lib/auth/signup-gate.ts apps/web/src/components/auth/signup-form.tsx apps/web/src/components/auth/signup-form.test.tsx
git commit -m "feat(web): gate Turnstile no cadastro antes do signUp"
```

---

### Task 8: App da paciente mostra o 429 no Fora de casa

**Files:**
- Modify: `apps/mobile/app/(app)/fora-de-casa.tsx:8-12,38-42`
- Modify: `apps/mobile/app/(app)/fora-de-casa.test.tsx`

**Interfaces:**
- Consumes: `ApiError` de `apps/mobile/lib/api.ts` (`status`, `body`).

- [ ] **Step 1: Testes**

Em `apps/mobile/app/(app)/fora-de-casa.test.tsx`, adicionar após os mocks existentes:

```tsx
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
import { ApiError } from '../../lib/api';
```

E os testes:

```tsx
  it('429 mostra a mensagem do servidor (teto diário)', async () => {
    mockState = {
      mutate: mockMutate, isPending: false, isError: true, data: undefined,
      error: new ApiError(429, { code: 'AI_DAILY_CAP_EXCEEDED', message: 'Limite diário de IA atingido. Tente amanhã.' }),
    };
    await render(<ForaDeCasa />);
    expect(screen.getByText('Limite diário de IA atingido. Tente amanhã.')).toBeTruthy();
    expect(screen.queryByText(/não foi possível gerar/i)).toBeNull();
  });

  it('outros erros mantêm a mensagem genérica', async () => {
    mockState = { mutate: mockMutate, isPending: false, isError: true, data: undefined, error: new Error('boom') };
    await render(<ForaDeCasa />);
    expect(screen.getByText(/não foi possível gerar a sugestão/i)).toBeTruthy();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/mobile test -- fora-de-casa`
Expected: FAIL no teste do 429 (mostra a genérica).

- [ ] **Step 3: Implementar**

Em `apps/mobile/app/(app)/fora-de-casa.tsx`, importar `import { ApiError } from '../../lib/api';` e, dentro do componente após `const outside = useOutsideHome();`:

```tsx
  const RATE_LIMITED_FALLBACK = 'Muitas solicitações. Aguarde um minuto e tente de novo.';
  const errorMessage =
    outside.error instanceof ApiError && outside.error.status === 429
      ? ((outside.error.body as { message?: string } | null)?.message ?? RATE_LIMITED_FALLBACK)
      : 'Não foi possível gerar a sugestão. Tente novamente.';
```

E trocar o texto fixo do bloco `isError` por `{errorMessage}`.

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @nutri-plus/mobile test -- fora-de-casa`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/app/(app)/fora-de-casa.tsx" "apps/mobile/app/(app)/fora-de-casa.test.tsx"
git commit -m "feat(mobile): Fora de casa mostra a mensagem do 429"
```

---

### Task 9: Documentação e checklist de painel

**Files:**
- Create: `docs/11-abuse-hardening.md`
- Modify: `docs/02-authentication.md` (uma linha)

- [ ] **Step 1: Escrever o doc**

`docs/11-abuse-hardening.md`:

```markdown
# Step 11 - Anti-abuso (rate limit, teto diário de IA, gate de cadastro)

Spec: `docs/superpowers/specs/2026-09-14-abuse-hardening-design.md`. Glossário em `CONTEXT.md`.

## Rate limit (API)

- `@nestjs/throttler`, guard global `ApiThrottlerGuard` registrado antes da autenticação.
- Chave: `user:<sub>` em rota autenticada (sub lido do JWT sem verificar; forjar leva 401), `ip:<req.ip>` em rota pública.
- Números em `apps/api/src/common/rate-limit/rate-limit.policy.ts`. `/health` fora do limite.
- Resposta: 429 `{ code: 'RATE_LIMITED' }` + `Retry-After`.

## Teto diário de IA (API)

- `AiUsageCapService` consultado pelo `OpenAIProvider` antes de qualquer chamada (texto, visão, transcrição).
- Conta `AIInteraction` do dia em São Paulo, sucesso e falha. Números em `apps/api/src/ai/ai-usage-cap.policy.ts`.
- Resposta: 429 `{ code: 'AI_DAILY_CAP_EXCEEDED', scope }`. Em job de fundo, vira `FAILED` com a mensagem.
- Cotas mensais por plano continuam em `EntitlementsService`.

## Gate de cadastro (web)

- Widget Turnstile no formulário (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`), verificado em `POST /api/signup-gate` (`TURNSTILE_SECRET_KEY`).
- Sem site key: widget e gate desligados (dev/testes). Sem secret em produção: 503, falha fechado.
- Captcha nativo do Supabase não é usado: valeria para o projeto todo e quebraria o login do app.

## Checklist de painel (uma vez)

1. Cloudflare → Turnstile → criar widget (modo Managed) com os domínios do web; copiar site key e secret key.
2. Vercel → projeto web → Environment Variables: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` (Production e Preview); redeploy.
3. Vercel → Firewall → ligar o managed ruleset de Bot Protection.
4. Supabase → Authentication → Attack protection: revisar limites de envio de e-mail e de tentativas de senha; confirmar "Confirm email" ligado.
5. OpenAI → Billing: limite mensal e alerta; a chave do iNutri só no Render do iNutri.
6. Render: nada a configurar (o rate limit não usa variável).
```

Em `docs/02-authentication.md`, após "## Important", acrescentar à lista:

```markdown
- login proxy (não existe `POST /auth/login`; web e app usam o SDK do Supabase)
```

- [ ] **Step 2: Commit**

```bash
git add docs/11-abuse-hardening.md docs/02-authentication.md
git commit -m "docs: anti-abuso (rate limit, teto diário de IA, gate de cadastro) e checklist de painel"
```

---

## Self-review

- **Spec coverage:** rate limit global e por rota (T1); chave por usuário/IP e Bearer forjado (T1); `/health` fora (T1); 429 `RATE_LIMITED` (T1); remoção do login (T2); teto diário nutricionista/paciente, sucesso e falha, dia em São Paulo (T3); gateway único cobre texto, visão e transcrição (T4); job vira FAILED com a mensagem (T4); web toast (T5); gate 204/400/403/503 (T6); widget, botão bloqueado, gate antes do signUp, conversão só depois (T7); mobile 429 (T8); docs e checklist (T9). Cota de trial, captcha no login e exclusão de contas ficam fora, como na spec.
- **Placeholders:** nenhum "TBD"; todo passo de código traz o código.
- **Type consistency:** `perMinute`/`RATE_LIMITS` (T1) usados em T2; `AiUsageCapService.assertWithinDailyCaps({ nutritionistId, patientId, type })` (T3) usado em T4; `AiDailyCapExceededException(scope)` (T3) usado em T4; `rateLimitMessageFrom` (T5) usado em T5; `turnstileSiteKey`/`verifySignupGate`/`CAPTCHA_FAILED_MESSAGE` (T7) coerentes entre implementação e mocks.
