# Painel de administradores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma página oculta `/admin`, só para e-mails em `ADMIN_EMAILS`, que lista (somente leitura) nutricionistas — incluindo quem não confirmou o e-mail — e pacientes, com filtros, paginação, detalhe da nutricionista e PDF da listagem filtrada.

**Architecture:** Na API, um `AdminModule` com `AdminGuard` (allowlist por env, 404 para não admin) e um `AdminService` que junta as nutricionistas do banco com os usuários não confirmados do Supabase Auth em memória, filtra, ordena e pagina; o PDF reaproveita `renderPdf`. Na web, páginas server-side em `app/(app)/admin` que chamam `notFound()` sem `isAdmin`, e componentes client com React Query.

**Tech Stack:** NestJS + Prisma 7 + Jest (`apps/api`), `@supabase/supabase-js` admin API, pdfmake (`renderPdf`), Next.js App Router + TanStack Query + Vitest (`apps/web`), `@nutri-plus/shared-types` (rebuild: `pnpm --filter @nutri-plus/shared-types build` na raiz).

**Spec:** `docs/superpowers/specs/2026-10-01-painel-admin-design.md`

## Global Constraints

- Somente leitura: só rotas `GET`; nenhuma escrita em lugar nenhum do painel.
- Admin = `ctx.user.email` (fallback `ctx.email`) presente em `ADMIN_EMAILS` (vírgula), comparação `trim().toLowerCase()`; env ausente/vazia ⇒ ninguém é admin.
- Logado e não admin ⇒ `NotFoundException` (404), nunca 403. Sem login ⇒ 401 do guard global (não mexer).
- Rotas de admin: `@AdminOnly()` + `@BillingExempt()`; nenhum `@Roles`.
- Não confirmado = usuário do Supabase Auth com `email_confirmed_at` nulo **e** `invited_at` nulo **e** sem `User` local com o mesmo `authProviderId`. Nome/telefone de `user_metadata.name`/`user_metadata.whatsapp`.
- `listUsers` falhou ⇒ `BadGatewayException('Não foi possível consultar o Supabase Auth.')`.
- Contagem de pacientes e aba Pacientes: só `isDemo = false`.
- Rótulos de plano (valor → texto): `COMP` Cortesia, `PRO` Pro, `ESSENCIAL` Essencial, `TRIAL` Teste grátis, `EXPIRED` Vencida, `NONE` Sem plano.
- Filtro de datas `createdFrom`/`createdTo` em `YYYY-MM-DD`, dias de America/Sao_Paulo, ambos inclusivos.
- `page` ≥ 1 (padrão 1); `pageSize` 1–100 (padrão 20). Ordenação: `createdAt` desc.
- PDF: A4 paisagem, título "Nutricionistas — iNutri", data/hora de geração (São Paulo), resumo dos filtros ("Sem filtros" se vazio), total, tabela (Nome, E-mail, Telefone, Confirmou, Pacientes, Plano, Cadastro); arquivo `nutricionistas-AAAA-MM-DD.pdf`.
- Rota `report.pdf` declarada **antes** de `:id` no controller.
- Web: nenhum link novo na sidebar/menus; `notFound()` quando `!me?.isAdmin`.
- Baseline de `tsc` na web: 8 erros pré-existentes (`first-run-host.test.tsx`, `hub-view.test.tsx`, `ai-generate-dialog.test.tsx`) — não adicionar nenhum. API: `tsc` limpo.
- Copy em pt-BR; comentários explicam o porquê, no estilo vizinho.

## Review Focus

1. Busca com acento/maiúscula ("lúcia" acha "Lucia Ferreira") — comparação normalizada (Task 2).
2. `createdTo` inclui o dia inteiro em São Paulo (cadastro 23:30 do dia `createdTo` aparece) (Task 2).
3. Página além do fim (`page` > total de páginas) devolve `items: []` com `total` correto, sem erro (Task 2).
4. Usuário convidado (paciente/funcionário com `invited_at`) nunca aparece como nutricionista não confirmada (Task 2).
5. PDF com filtros que não retornam ninguém gera um PDF válido com "Nenhuma nutricionista encontrada." (Task 3).

---

## File Structure

**Shared** — `packages/shared-types/src/v1/admin.ts` (tipos), `v1/auth.ts` (`isAdmin`), `v1/index.ts` (export).

**API** — `src/admin/`: `admin-access.ts` (+spec), `admin.guard.ts` (+spec), `admin-only.decorator.ts`, `admin-nutritionists.ts` (+spec, funções puras de junção/filtro/paginação), `admin-report-doc.ts` (+spec), `admin.service.ts` (+spec), `admin.controller.ts`, `admin.module.ts`, `dto/list-admin-nutritionists.dto.ts`, `dto/list-admin-patients.dto.ts`. Modificar: `billing/plan-policy.ts` (+spec, `planLabelOf`), `supabase/supabase-admin.service.ts` (`listAllUsers`), `auth/auth.service.ts` (+spec, `isAdmin`), `auth/auth.controller.ts`, `config/env.schema.ts`, `app.module.ts`.

**Web** — `src/lib/api/admin.ts` (+test), `src/lib/queries/admin.ts`, `src/lib/admin/labels.ts`, `src/components/admin/admin-view.tsx`, `nutritionists-tab.tsx` (+test), `patients-tab.tsx` (+test), `nutritionist-detail.tsx` (+test), `src/app/(app)/admin/page.tsx` (+test), `src/app/(app)/admin/nutritionists/[id]/page.tsx`.

---

### Task 1: Acesso de admin (allowlist, guard, `isAdmin` no `/auth/me`) e `planLabelOf`

**Files:**
- Create: `packages/shared-types/src/v1/admin.ts`; Modify: `packages/shared-types/src/v1/auth.ts`, `packages/shared-types/src/v1/index.ts`
- Create: `apps/api/src/admin/admin-access.ts`, `admin-access.spec.ts`, `admin.guard.ts`, `admin.guard.spec.ts`, `admin-only.decorator.ts`
- Modify: `apps/api/src/billing/plan-policy.ts`, `plan-policy.spec.ts` (criar o spec se não existir)
- Modify: `apps/api/src/config/env.schema.ts`, `apps/api/src/auth/auth.service.ts`, `auth.service.spec.ts`, `auth.controller.ts`

**Interfaces:**
- Produces:
  ```ts
  // shared-types v1/admin.ts
  export type AdminPlanLabel = 'COMP' | 'PRO' | 'ESSENCIAL' | 'TRIAL' | 'EXPIRED' | 'NONE';
  export const ADMIN_PLAN_LABELS: Record<AdminPlanLabel, string>;
  export interface AdminNutritionistRow { id: string | null; name: string; email: string; phone: string | null; confirmed: boolean; patientCount: number; plan: AdminPlanLabel; createdAt: string }
  export interface AdminPatientRow { id: string; name: string; email: string | null; phone: string | null; nutritionistName: string; inviteStatus: PatientInviteStatus; createdAt: string }
  export interface AdminNutritionistFilters { search?: string; confirmed?: 'yes' | 'no'; plan?: AdminPlanLabel; createdFrom?: string; createdTo?: string }
  export interface AdminNutritionistDetail { nutritionist: AdminNutritionistRow; patients: AdminPatientRow[] }
  // shared-types v1/auth.ts — MeResponse ganha: isAdmin?: boolean
  // api admin-access.ts
  export function parseAdminEmails(raw: string | undefined): Set<string>;
  export function isAdminEmail(email: string | null | undefined, raw: string | undefined): boolean;
  // api admin.guard.ts
  export class AdminGuard implements CanActivate {} // usa ConfigService('ADMIN_EMAILS') + Reflector(ADMIN_ONLY_KEY)
  // api admin-only.decorator.ts
  export const ADMIN_ONLY_KEY = 'adminOnly';
  export const AdminOnly: () => MethodDecorator & ClassDecorator; // SetMetadata + UseGuards(AdminGuard)
  // api billing/plan-policy.ts
  export function planLabelOf(sub: { isComp: boolean; status: string; plan: 'ESSENCIAL' | 'PRO' | null; currentPeriodEnd: Date | null; trialEndsAt: Date | null } | null, now: Date): AdminPlanLabel;
  ```

- [ ] **Step 1: Tipos compartilhados**

`packages/shared-types/src/v1/admin.ts`:

```ts
import type { PatientInviteStatus } from './patient';

// Painel de administradores (somente leitura). Valores do plano ativo como
// rótulo, derivados da mesma regra de acesso do EntitlementsService.
export type AdminPlanLabel = 'COMP' | 'PRO' | 'ESSENCIAL' | 'TRIAL' | 'EXPIRED' | 'NONE';

export const ADMIN_PLAN_LABELS: Record<AdminPlanLabel, string> = {
  COMP: 'Cortesia',
  PRO: 'Pro',
  ESSENCIAL: 'Essencial',
  TRIAL: 'Teste grátis',
  EXPIRED: 'Vencida',
  NONE: 'Sem plano',
};

export interface AdminNutritionistRow {
  id: string | null; // NutritionistProfile.id; nulo para quem não confirmou o e-mail
  name: string;
  email: string;
  phone: string | null;
  confirmed: boolean;
  patientCount: number;
  plan: AdminPlanLabel;
  createdAt: string; // ISO
}

export interface AdminPatientRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nutritionistName: string;
  inviteStatus: PatientInviteStatus;
  createdAt: string; // ISO
}

export interface AdminNutritionistFilters {
  search?: string;
  confirmed?: 'yes' | 'no';
  plan?: AdminPlanLabel;
  createdFrom?: string; // YYYY-MM-DD (São Paulo)
  createdTo?: string; // YYYY-MM-DD (São Paulo), inclusivo
}

export interface AdminNutritionistDetail {
  nutritionist: AdminNutritionistRow;
  patients: AdminPatientRow[];
}
```

Em `v1/auth.ts`, dentro de `MeResponse`, adicionar `isAdmin?: boolean;` com o comentário `// Painel de administradores: true só para e-mails em ADMIN_EMAILS (API).`. Em `v1/index.ts`: `export * from './admin';`. Rodar `pnpm --filter @nutri-plus/shared-types build` (raiz).

- [ ] **Step 2: Testes (falhando)**

`apps/api/src/admin/admin-access.spec.ts`:

```ts
import { isAdminEmail, parseAdminEmails } from './admin-access';

describe('admin allowlist', () => {
  it('parses a comma list, trimming and lowercasing', () => {
    expect([...parseAdminEmails(' A@x.com, b@Y.com ,,')]).toEqual(['a@x.com', 'b@y.com']);
  });

  it('treats a missing or empty env as no admins', () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(parseAdminEmails('  ').size).toBe(0);
    expect(isAdminEmail('a@x.com', undefined)).toBe(false);
  });

  it('matches ignoring case and spaces', () => {
    expect(isAdminEmail('  Paulo.H.Mendes25@Gmail.com ', 'paulo.h.mendes25@gmail.com')).toBe(true);
    expect(isAdminEmail('outro@x.com', 'paulo.h.mendes25@gmail.com')).toBe(false);
    expect(isAdminEmail(null, 'paulo.h.mendes25@gmail.com')).toBe(false);
  });
});
```

`apps/api/src/admin/admin.guard.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminGuard } from './admin.guard';

function contextFor(user: unknown) {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('AdminGuard', () => {
  const config = (value?: string) => ({ get: () => value }) as any;
  const reflector = { getAllAndOverride: () => true } as unknown as Reflector;

  it('lets an allowlisted user through', () => {
    const guard = new AdminGuard(reflector, config('admin@x.com'));
    expect(guard.canActivate(contextFor({ email: 'x', user: { email: 'Admin@x.com' } }))).toBe(true);
  });

  it('answers 404 to a logged-in user who is not an admin', () => {
    const guard = new AdminGuard(reflector, config('admin@x.com'));
    expect(() => guard.canActivate(contextFor({ email: 'n@x.com', user: { email: 'n@x.com' } }))).toThrow(
      NotFoundException,
    );
  });

  it('answers 404 when no admin is configured', () => {
    const guard = new AdminGuard(reflector, config(undefined));
    expect(() => guard.canActivate(contextFor({ email: 'admin@x.com', user: { email: 'admin@x.com' } }))).toThrow(
      NotFoundException,
    );
  });

  it('answers 404 without a local user', () => {
    const guard = new AdminGuard(reflector, config('admin@x.com'));
    expect(() => guard.canActivate(contextFor({ email: 'admin@x.com', user: null }))).toThrow(NotFoundException);
  });

  it('does nothing on routes without @AdminOnly', () => {
    const notAdminRoute = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new AdminGuard(notAdminRoute, config(undefined));
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });
});
```

Em `plan-policy.spec.ts` (criar se não existir; importar `planLabelOf` de `./plan-policy`):

```ts
describe('planLabelOf', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');
  const later = new Date('2026-10-20T00:00:00.000Z');
  const earlier = new Date('2026-09-20T00:00:00.000Z');
  const base = { isComp: false, status: 'ACTIVE', plan: 'PRO' as const, currentPeriodEnd: later, trialEndsAt: null };

  it('is NONE without a subscription', () => expect(planLabelOf(null, now)).toBe('NONE'));
  it('is COMP for a courtesy, whatever the status', () =>
    expect(planLabelOf({ ...base, isComp: true, status: 'PAST_DUE', currentPeriodEnd: earlier }, now)).toBe('COMP'));
  it('is PRO for an active Pro in period', () => expect(planLabelOf(base, now)).toBe('PRO'));
  it('is ESSENCIAL for an active Essencial (or null plan) in period', () => {
    expect(planLabelOf({ ...base, plan: 'ESSENCIAL' }, now)).toBe('ESSENCIAL');
    expect(planLabelOf({ ...base, plan: null }, now)).toBe('ESSENCIAL');
  });
  it('is TRIAL for a running trial', () =>
    expect(planLabelOf({ ...base, status: 'TRIALING', plan: null, currentPeriodEnd: null, trialEndsAt: later }, now)).toBe('TRIAL'));
  it('is EXPIRED once the period or the trial is over', () => {
    expect(planLabelOf({ ...base, currentPeriodEnd: earlier }, now)).toBe('EXPIRED');
    expect(planLabelOf({ ...base, status: 'TRIALING', currentPeriodEnd: null, trialEndsAt: earlier }, now)).toBe('EXPIRED');
    expect(planLabelOf({ ...base, status: 'CANCELED', currentPeriodEnd: null }, now)).toBe('EXPIRED');
  });
});
```

Em `auth.service.spec.ts`: o `AuthService` passa a receber `ConfigService`. Construir com `new AuthService(users as unknown as UsersService, { get: (k: string) => (k === 'ADMIN_EMAILS' ? 'admin@x.com' : undefined) } as any)` e adicionar:

```ts
  it('flags the admin on /me', () => {
    const ctx = { ...newCtx, email: 'admin@x.com', user: { id: 'u1', email: 'Admin@x.com' } as any };
    expect(service.me(ctx)).toMatchObject({ id: 'u1', isAdmin: true });
  });

  it('does not flag other users on /me', () => {
    const ctx = { ...newCtx, user: { id: 'u2', email: 'a@x.com' } as any };
    expect(service.me(ctx)).toMatchObject({ id: 'u2', isAdmin: false });
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run (em `apps/api`): `npx jest --config jest.config.ts src/admin src/billing/plan-policy src/auth/auth.service`
Expected: FAIL — módulos `./admin-access`, `./admin.guard` inexistentes; `planLabelOf` não exportado; `isAdmin` ausente.

- [ ] **Step 4: Implementar**

`apps/api/src/admin/admin-access.ts`:

```ts
// Allowlist do painel de administradores (env ADMIN_EMAILS, separada por
// vírgula). Ausente ou vazia ⇒ ninguém é admin: o padrão seguro.
export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined, raw: string | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).has(email.trim().toLowerCase());
}
```

`apps/api/src/admin/admin-only.decorator.ts`:

```ts
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

export const ADMIN_ONLY_KEY = 'adminOnly';

// Rotas do painel de administradores. O AdminGuard roda depois dos guards
// globais (auth → roles → assinatura), já com o AuthContext preenchido.
export const AdminOnly = () => applyDecorators(SetMetadata(ADMIN_ONLY_KEY, true), UseGuards(AdminGuard));
```

`apps/api/src/admin/admin.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthContext } from '../auth/types/auth-context';
import { isAdminEmail } from './admin-access';

const ADMIN_ONLY_KEY = 'adminOnly';

// 404 (e não 403) para quem está logado mas não é admin: não revela que o
// painel existe. Sem login, o SupabaseAuthGuard global já respondeu 401.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const adminOnly = this.reflector.getAllAndOverride<boolean | undefined>(ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!adminOnly) return true;
    const ctx: AuthContext | undefined = context.switchToHttp().getRequest().user;
    if (!ctx?.user || !isAdminEmail(ctx.user.email ?? ctx.email, this.config.get<string>('ADMIN_EMAILS'))) {
      throw new NotFoundException();
    }
    return true;
  }
}
```

(Não importar `ADMIN_ONLY_KEY` do decorator para evitar import circular; o valor literal é o mesmo.)

`billing/plan-policy.ts` — adicionar (importar o tipo `AdminPlanLabel` de `@nutri-plus/shared-types`):

```ts
// Plano ativo como rótulo (painel de administradores). Mesma ordem de decisão
// de EntitlementsService.resolveAccess: cortesia > ativa no período > teste no
// prazo > o resto é vencida.
export function planLabelOf(
  sub: {
    isComp: boolean;
    status: string;
    plan: 'ESSENCIAL' | 'PRO' | null;
    currentPeriodEnd: Date | null;
    trialEndsAt: Date | null;
  } | null,
  now: Date,
): AdminPlanLabel {
  if (!sub) return 'NONE';
  if (sub.isComp) return 'COMP';
  if (sub.status === 'ACTIVE' && sub.currentPeriodEnd && sub.currentPeriodEnd > now) {
    return sub.plan === 'PRO' ? 'PRO' : 'ESSENCIAL';
  }
  if (sub.status === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt > now) return 'TRIAL';
  return 'EXPIRED';
}
```

`config/env.schema.ts` — junto das outras opcionais:

```ts
  // Painel de administradores: e-mails separados por vírgula. Ausente ⇒ ninguém
  // é admin (o painel fica inacessível).
  ADMIN_EMAILS: z.string().optional(),
```

`auth/auth.service.ts` — injetar `ConfigService` e trocar `me`:

```ts
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}
  // …
  me(ctx: AuthContext): LocalUser & { isAdmin: boolean } {
    if (!ctx.user) {
      throw new ConflictException('User not synced. Call POST /v1/auth/sync-user first.');
    }
    return { ...ctx.user, isAdmin: isAdminEmail(ctx.user.email ?? ctx.email, this.config.get<string>('ADMIN_EMAILS')) };
  }
```

`auth.controller.ts`: ajustar o tipo de retorno de `me` para `LocalUser & { isAdmin: boolean }`. (`ConfigModule` é global — nenhum import de módulo.)

- [ ] **Step 5: Rodar**

Run: `npx jest --config jest.config.ts src/admin src/billing src/auth` e `npx tsc --noEmit -p tsconfig.json`.
Expected: PASS; tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/v1 apps/api/src/admin apps/api/src/billing/plan-policy.ts apps/api/src/billing/plan-policy.spec.ts apps/api/src/config/env.schema.ts apps/api/src/auth
git commit -m "feat(api): acesso de admin por allowlist e rótulo do plano ativo"
```

---

### Task 2: Listagem de nutricionistas (Supabase Auth + banco)

**Files:**
- Modify: `apps/api/src/supabase/supabase-admin.service.ts` (`listAllUsers`)
- Create: `apps/api/src/admin/admin-nutritionists.ts`, `admin-nutritionists.spec.ts`, `admin.service.ts`, `admin.service.spec.ts`, `admin.controller.ts`, `admin.module.ts`, `dto/list-admin-nutritionists.dto.ts`
- Modify: `apps/api/src/app.module.ts` (importar `AdminModule`)

**Interfaces:**
- Consumes: `AdminOnly`, `planLabelOf`, tipos `AdminNutritionistRow`/`AdminNutritionistFilters` (Task 1).
- Produces:
  ```ts
  // supabase-admin.service.ts
  export interface AuthUserSummary { id: string; email: string | null; emailConfirmedAt: string | null; invitedAt: string | null; createdAt: string; name: string | null; phone: string | null }
  listAllUsers(): Promise<AuthUserSummary[]>; // BadGatewayException('Não foi possível consultar o Supabase Auth.') em falha
  // admin-nutritionists.ts
  export function unconfirmedRows(authUsers: AuthUserSummary[], localAuthIds: Set<string>): AdminNutritionistRow[];
  export function filterNutritionists(rows: AdminNutritionistRow[], f: AdminNutritionistFilters): AdminNutritionistRow[]; // + ordena createdAt desc
  export function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T>;
  // admin.service.ts
  class AdminService { listNutritionists(f: AdminNutritionistFilters, page: number, pageSize: number): Promise<Paginated<AdminNutritionistRow>>; allNutritionists(f: AdminNutritionistFilters): Promise<AdminNutritionistRow[]> }
  // HTTP: GET /v1/admin/nutritionists?search&confirmed&plan&createdFrom&createdTo&page&pageSize
  ```

- [ ] **Step 1: Testes das funções puras (falhando)**

`apps/api/src/admin/admin-nutritionists.spec.ts`:

```ts
import { filterNutritionists, paginate, unconfirmedRows } from './admin-nutritionists';
import type { AdminNutritionistRow } from '@nutri-plus/shared-types';

function row(over: Partial<AdminNutritionistRow> = {}): AdminNutritionistRow {
  return {
    id: 'n1', name: 'Ana Souza', email: 'ana@x.com', phone: null, confirmed: true,
    patientCount: 3, plan: 'PRO', createdAt: '2026-09-10T15:00:00.000Z', ...over,
  };
}

describe('unconfirmedRows', () => {
  const base = { emailConfirmedAt: null, invitedAt: null, createdAt: '2026-09-01T10:00:00.000Z', name: 'Bia', phone: '+55 (11) 9' };

  it('keeps only signups that never confirmed and have no local user', () => {
    const rows = unconfirmedRows(
      [
        { ...base, id: 'a1', email: 'pendente@x.com' },
        { ...base, id: 'a2', email: 'confirmou@x.com', emailConfirmedAt: '2026-09-02T00:00:00Z' },
        { ...base, id: 'a3', email: 'convidado@x.com', invitedAt: '2026-09-02T00:00:00Z' },
        { ...base, id: 'a4', email: 'local@x.com' },
      ],
      new Set(['a4']),
    );
    expect(rows).toEqual([
      {
        id: null, name: 'Bia', email: 'pendente@x.com', phone: '+55 (11) 9', confirmed: false,
        patientCount: 0, plan: 'NONE', createdAt: '2026-09-01T10:00:00.000Z',
      },
    ]);
  });

  it('falls back to the e-mail when the signup has no name', () => {
    const [r] = unconfirmedRows([{ ...base, id: 'a1', email: 'semnome@x.com', name: null }], new Set());
    expect(r.name).toBe('semnome@x.com');
  });
});

describe('filterNutritionists', () => {
  const rows = [
    row({ id: 'n1', name: 'Lúcia Ferreira', email: 'lucia@x.com', createdAt: '2026-09-10T15:00:00.000Z' }),
    row({ id: 'n2', name: 'Bruno', email: 'BRUNO@x.com', plan: 'TRIAL', createdAt: '2026-09-20T15:00:00.000Z' }),
    row({ id: null, name: 'Pendente', email: 'p@x.com', confirmed: false, plan: 'NONE', createdAt: '2026-09-30T02:30:00.000Z' }),
  ];

  it('sorts newest first', () => {
    expect(filterNutritionists(rows, {}).map((r) => r.email)).toEqual(['p@x.com', 'BRUNO@x.com', 'lucia@x.com']);
  });

  it('searches name or e-mail ignoring case and accents', () => {
    expect(filterNutritionists(rows, { search: 'lucia' }).map((r) => r.id)).toEqual(['n1']);
    expect(filterNutritionists(rows, { search: 'bruno@' }).map((r) => r.id)).toEqual(['n2']);
  });

  it('filters by confirmation and plan', () => {
    expect(filterNutritionists(rows, { confirmed: 'no' }).map((r) => r.email)).toEqual(['p@x.com']);
    expect(filterNutritionists(rows, { confirmed: 'yes' })).toHaveLength(2);
    expect(filterNutritionists(rows, { plan: 'TRIAL' }).map((r) => r.id)).toEqual(['n2']);
  });

  it('treats the date range as inclusive São Paulo days', () => {
    // 2026-09-30T02:30Z é 29/09 23:30 em São Paulo.
    expect(filterNutritionists(rows, { createdTo: '2026-09-29' }).map((r) => r.email)).toContain('p@x.com');
    expect(filterNutritionists(rows, { createdFrom: '2026-09-30' })).toHaveLength(0);
    expect(filterNutritionists(rows, { createdFrom: '2026-09-10', createdTo: '2026-09-10' }).map((r) => r.id)).toEqual(['n1']);
  });
});

describe('paginate', () => {
  it('slices and reports totals', () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual({ items: [3, 4], total: 5, page: 2, pageSize: 2, totalPages: 3 });
  });

  it('returns an empty page past the end, keeping the total', () => {
    expect(paginate([1, 2, 3], 5, 2)).toEqual({ items: [], total: 3, page: 5, pageSize: 2, totalPages: 2 });
  });
});
```

Conferir a forma exata de `Paginated<T>` em `packages/shared-types/src/v1/pagination.ts` (campos `items, total, page, pageSize, totalPages`) e ajustar os `toEqual` se diferir.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --config jest.config.ts src/admin/admin-nutritionists`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar as funções puras**

`apps/api/src/admin/admin-nutritionists.ts`:

```ts
import type { AdminNutritionistFilters, AdminNutritionistRow, Paginated } from '@nutri-plus/shared-types';
import type { AuthUserSummary } from '../supabase/supabase-admin.service';

// Quem se cadastrou e não confirmou o e-mail existe só no Supabase Auth: o
// usuário local (User + NutritionistProfile) nasce no sync-user, depois da
// confirmação. Convidados (pacientes/funcionários) também não confirmam até
// aceitar o convite — o invited_at separa os dois casos.
export function unconfirmedRows(authUsers: AuthUserSummary[], localAuthIds: Set<string>): AdminNutritionistRow[] {
  return authUsers
    .filter((u) => !u.emailConfirmedAt && !u.invitedAt && !localAuthIds.has(u.id) && !!u.email)
    .map((u) => ({
      id: null,
      name: u.name?.trim() || (u.email as string),
      email: u.email as string,
      phone: u.phone,
      confirmed: false,
      patientCount: 0,
      plan: 'NONE' as const,
      createdAt: new Date(u.createdAt).toISOString(),
    }));
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Dia de São Paulo (YYYY-MM-DD) de um instante ISO; compara-se como texto.
function saoPauloDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function filterNutritionists(rows: AdminNutritionistRow[], f: AdminNutritionistFilters): AdminNutritionistRow[] {
  const term = f.search ? fold(f.search.trim()) : '';
  return rows
    .filter((r) => !term || fold(r.name).includes(term) || fold(r.email).includes(term))
    .filter((r) => !f.confirmed || r.confirmed === (f.confirmed === 'yes'))
    .filter((r) => !f.plan || r.plan === f.plan)
    .filter((r) => !f.createdFrom || saoPauloDay(r.createdAt) >= f.createdFrom)
    .filter((r) => !f.createdTo || saoPauloDay(r.createdAt) <= f.createdTo)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
    totalPages: Math.ceil(items.length / pageSize),
  };
}
```

- [ ] **Step 4: `listAllUsers` no Supabase**

Em `supabase-admin.service.ts`, exportar a interface e adicionar o método:

```ts
export interface AuthUserSummary {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
  invitedAt: string | null;
  createdAt: string;
  name: string | null;
  phone: string | null;
}

  // Todos os usuários do Supabase Auth (painel de administradores). Pagina até
  // a última página; qualquer falha vira 502 — melhor do que uma lista que
  // esconderia quem não confirmou.
  async listAllUsers(): Promise<AuthUserSummary[]> {
    const perPage = 1000;
    const out: AuthUserSummary[] = [];
    for (let page = 1; ; page++) {
      let res: Awaited<ReturnType<SupabaseClient['auth']['admin']['listUsers']>>;
      try {
        res = await this.client.auth.admin.listUsers({ page, perPage });
      } catch {
        throw new BadGatewayException('Não foi possível consultar o Supabase Auth.');
      }
      if (res.error) throw new BadGatewayException('Não foi possível consultar o Supabase Auth.');
      for (const u of res.data.users) {
        const meta = (u.user_metadata ?? {}) as { name?: unknown; whatsapp?: unknown };
        out.push({
          id: u.id,
          email: u.email ?? null,
          emailConfirmedAt: u.email_confirmed_at ?? null,
          invitedAt: u.invited_at ?? null,
          createdAt: u.created_at,
          name: typeof meta.name === 'string' ? meta.name : null,
          phone: typeof meta.whatsapp === 'string' ? meta.whatsapp : null,
        });
      }
      if (res.data.users.length < perPage) return out;
    }
  }
```

- [ ] **Step 5: Serviço, DTO, controller e módulo (teste primeiro)**

`apps/api/src/admin/admin.service.spec.ts`:

```ts
import { BadGatewayException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AdminService } from './admin.service';

describe('AdminService.listNutritionists', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let supabase: DeepMockProxy<SupabaseAdminService>;
  let service: AdminService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    supabase = mockDeep<SupabaseAdminService>();
    service = new AdminService(prisma, supabase);
    prisma.nutritionistProfile.findMany.mockResolvedValue([
      {
        id: 'n1',
        whatsappNumber: '5511999998888',
        user: { name: 'Ana', email: 'ana@x.com', authProviderId: 'auth-ana', createdAt: new Date('2026-09-10T12:00:00Z') },
        subscription: { isComp: true, status: 'PAST_DUE', plan: 'PRO', currentPeriodEnd: null, trialEndsAt: null },
        _count: { patients: 4 },
      },
    ] as any);
    supabase.listAllUsers.mockResolvedValue([
      { id: 'auth-ana', email: 'ana@x.com', emailConfirmedAt: '2026-09-10T12:00:00Z', invitedAt: null, createdAt: '2026-09-10T12:00:00Z', name: 'Ana', phone: null },
      { id: 'auth-pend', email: 'pend@x.com', emailConfirmedAt: null, invitedAt: null, createdAt: '2026-09-20T12:00:00Z', name: 'Pend', phone: null },
    ]);
  });

  it('merges confirmed nutritionists with pending signups', async () => {
    const res = await service.listNutritionists({}, 1, 20);
    expect(res.total).toBe(2);
    expect(res.items).toEqual([
      expect.objectContaining({ id: null, email: 'pend@x.com', confirmed: false, plan: 'NONE', patientCount: 0 }),
      expect.objectContaining({ id: 'n1', email: 'ana@x.com', confirmed: true, plan: 'COMP', patientCount: 4, phone: '5511999998888' }),
    ]);
  });

  it('counts only real patients', async () => {
    await service.listNutritionists({}, 1, 20);
    expect(prisma.nutritionistProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { patients: { where: { isDemo: false } } } },
        }),
      }),
    );
  });

  it('propagates a 502 when Supabase Auth is unavailable', async () => {
    supabase.listAllUsers.mockRejectedValue(new BadGatewayException('Não foi possível consultar o Supabase Auth.'));
    await expect(service.listNutritionists({}, 1, 20)).rejects.toBeInstanceOf(BadGatewayException);
  });
});
```

`apps/api/src/admin/dto/list-admin-nutritionists.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class AdminNutritionistFiltersDto {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsIn(['yes', 'no']) confirmed?: 'yes' | 'no';
  @IsOptional() @IsIn(['COMP', 'PRO', 'ESSENCIAL', 'TRIAL', 'EXPIRED', 'NONE'])
  plan?: 'COMP' | 'PRO' | 'ESSENCIAL' | 'TRIAL' | 'EXPIRED' | 'NONE';
  @IsOptional() @Matches(DAY) createdFrom?: string;
  @IsOptional() @Matches(DAY) createdTo?: string;
}

export class ListAdminNutritionistsDto extends AdminNutritionistFiltersDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
```

`apps/api/src/admin/admin.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { AdminNutritionistFilters, AdminNutritionistRow, Paginated } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { planLabelOf } from '../billing/plan-policy';
import { filterNutritionists, paginate, unconfirmedRows } from './admin-nutritionists';

// Painel de administradores: somente leitura, dados de todas as nutricionistas.
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  async listNutritionists(
    f: AdminNutritionistFilters,
    page: number,
    pageSize: number,
  ): Promise<Paginated<AdminNutritionistRow>> {
    return paginate(await this.allNutritionists(f), page, pageSize);
  }

  // Todas as linhas que passam nos filtros, sem paginação (também usado pelo PDF).
  async allNutritionists(f: AdminNutritionistFilters): Promise<AdminNutritionistRow[]> {
    const [profiles, authUsers] = await Promise.all([
      this.prisma.nutritionistProfile.findMany({
        include: {
          user: { select: { name: true, email: true, authProviderId: true, createdAt: true } },
          subscription: true,
          _count: { select: { patients: { where: { isDemo: false } } } },
        },
      }),
      this.supabaseAdmin.listAllUsers(),
    ]);
    const now = new Date();
    const confirmed: AdminNutritionistRow[] = profiles.map((p) => ({
      id: p.id,
      name: p.user.name,
      email: p.user.email,
      phone: p.whatsappNumber,
      confirmed: true,
      patientCount: p._count.patients,
      plan: planLabelOf(p.subscription, now),
      createdAt: p.user.createdAt.toISOString(),
    }));
    const localAuthIds = new Set(profiles.map((p) => p.user.authProviderId));
    return filterNutritionists([...confirmed, ...unconfirmedRows(authUsers, localAuthIds)], f);
  }
}
```

`apps/api/src/admin/admin.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BillingExempt } from '../billing/decorators';
import { AdminOnly } from './admin-only.decorator';
import { AdminService } from './admin.service';
import { ListAdminNutritionistsDto } from './dto/list-admin-nutritionists.dto';

// Somente GET: o painel não altera nada. Sem @Roles — o acesso é a allowlist.
@ApiTags('admin')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
@AdminOnly()
@BillingExempt()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('nutritionists')
  listNutritionists(@Query() q: ListAdminNutritionistsDto) {
    const { page = 1, pageSize = 20, ...filters } = q;
    return this.admin.listNutritionists(filters, page, pageSize);
  }
}
```

`apps/api/src/admin/admin.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SupabaseAdminModule } from '../supabase/supabase-admin.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  imports: [SupabaseAdminModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
```

Em `app.module.ts`, adicionar `AdminModule` aos `imports` (junto dos outros módulos de feature). `PrismaService` é global? Conferir como outros módulos (ex.: `MealLogsModule`) recebem o `PrismaService` e seguir o mesmo padrão (importar `PrismaModule` se necessário).

- [ ] **Step 6: Rodar**

Run: `npx jest --config jest.config.ts src/admin src/supabase` e `npx tsc --noEmit -p tsconfig.json`.
Expected: PASS; tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/admin apps/api/src/supabase/supabase-admin.service.ts apps/api/src/app.module.ts
git commit -m "feat(api): listagem de nutricionistas do painel admin, com quem não confirmou"
```

---

### Task 3: Relatório PDF da listagem

**Files:**
- Create: `apps/api/src/admin/admin-report-doc.ts`, `admin-report-doc.spec.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`, `admin.service.ts` (+spec)

**Interfaces:**
- Consumes: `AdminService.allNutritionists(f)` (Task 2), `ADMIN_PLAN_LABELS` (Task 1), `renderPdf` (`../meal-plans/pdf/pdf-printer`).
- Produces:
  ```ts
  export function buildNutritionistsReportDoc(input: { rows: AdminNutritionistRow[]; filters: AdminNutritionistFilters; generatedAt: Date }): TDocumentDefinitions;
  export function describeFilters(f: AdminNutritionistFilters): string; // "Sem filtros" quando vazio
  AdminService.nutritionistsReport(f: AdminNutritionistFilters): Promise<{ buffer: Buffer; fileName: string }>;
  // HTTP: GET /v1/admin/nutritionists/report.pdf?<filtros> → application/pdf, attachment; filename="nutricionistas-AAAA-MM-DD.pdf"
  ```

- [ ] **Step 1: Testes (falhando)**

`apps/api/src/admin/admin-report-doc.spec.ts`:

```ts
import { buildNutritionistsReportDoc, describeFilters } from './admin-report-doc';
import { renderPdf } from '../meal-plans/pdf/pdf-printer';

const row = {
  id: 'n1', name: 'Ana Souza', email: 'ana@x.com', phone: '5511999998888', confirmed: true,
  patientCount: 3, plan: 'PRO' as const, createdAt: '2026-09-10T15:00:00.000Z',
};

describe('describeFilters', () => {
  it('says "Sem filtros" when nothing is set', () => expect(describeFilters({})).toBe('Sem filtros'));
  it('lists the active filters in Portuguese', () => {
    expect(
      describeFilters({ search: 'ana', confirmed: 'no', plan: 'TRIAL', createdFrom: '2026-09-01', createdTo: '2026-09-30' }),
    ).toBe('Busca: "ana" · Confirmou: Não · Plano: Teste grátis · Cadastro: de 01/09/2026 até 30/09/2026');
  });
});

describe('buildNutritionistsReportDoc', () => {
  const doc = buildNutritionistsReportDoc({ rows: [row], filters: { plan: 'PRO' }, generatedAt: new Date('2026-10-01T15:00:00Z') });
  const json = JSON.stringify(doc);

  it('is A4 landscape with title, filters, total and the table', () => {
    expect(doc.pageSize).toBe('A4');
    expect(doc.pageOrientation).toBe('landscape');
    expect(json).toContain('Nutricionistas — iNutri');
    expect(json).toContain('Plano: Pro');
    expect(json).toContain('1 nutricionista');
    for (const h of ['Nome', 'E-mail', 'Telefone', 'Confirmou', 'Pacientes', 'Plano', 'Cadastro']) expect(json).toContain(h);
    expect(json).toContain('Ana Souza');
    expect(json).toContain('10/09/2026');
  });

  it('renders a valid PDF even with no rows', async () => {
    const empty = buildNutritionistsReportDoc({ rows: [], filters: {}, generatedAt: new Date() });
    expect(JSON.stringify(empty)).toContain('Nenhuma nutricionista encontrada.');
    const buf = await renderPdf(empty);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
```

Em `admin.service.spec.ts`, adicionar:

```ts
describe('AdminService.nutritionistsReport', () => {
  it('uses every filtered row, ignoring pagination, and names the file by date', async () => {
    const prisma = mockDeep<PrismaService>();
    const supabase = mockDeep<SupabaseAdminService>();
    const service = new AdminService(prisma, supabase);
    const rows = Array.from({ length: 45 }, (_, i) => ({
      id: `n${i}`, name: `N${i}`, email: `n${i}@x.com`, phone: null, confirmed: true,
      patientCount: 0, plan: 'NONE' as const, createdAt: '2026-09-10T15:00:00.000Z',
    }));
    const all = jest.spyOn(service, 'allNutritionists').mockResolvedValue(rows);

    const { buffer, fileName } = await service.nutritionistsReport({ confirmed: 'yes' });

    expect(all).toHaveBeenCalledWith({ confirmed: 'yes' });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(fileName).toMatch(/^nutricionistas-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --config jest.config.ts src/admin`
Expected: FAIL — `./admin-report-doc` inexistente; `nutritionistsReport` não é função.

- [ ] **Step 3: Implementar**

`apps/api/src/admin/admin-report-doc.ts`:

```ts
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { ADMIN_PLAN_LABELS, type AdminNutritionistFilters, type AdminNutritionistRow } from '@nutri-plus/shared-types';

const brDay = (ymd: string) => ymd.split('-').reverse().join('/');
const brDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export function describeFilters(f: AdminNutritionistFilters): string {
  const parts: string[] = [];
  if (f.search?.trim()) parts.push(`Busca: "${f.search.trim()}"`);
  if (f.confirmed) parts.push(`Confirmou: ${f.confirmed === 'yes' ? 'Sim' : 'Não'}`);
  if (f.plan) parts.push(`Plano: ${ADMIN_PLAN_LABELS[f.plan]}`);
  if (f.createdFrom || f.createdTo) {
    const from = f.createdFrom ? `de ${brDay(f.createdFrom)}` : '';
    const to = f.createdTo ? `até ${brDay(f.createdTo)}` : '';
    parts.push(`Cadastro: ${[from, to].filter(Boolean).join(' ')}`);
  }
  return parts.length ? parts.join(' · ') : 'Sem filtros';
}

// Relatório da listagem de nutricionistas do painel admin: todas as linhas que
// passam nos filtros (sem paginação), em A4 paisagem.
export function buildNutritionistsReportDoc(input: {
  rows: AdminNutritionistRow[];
  filters: AdminNutritionistFilters;
  generatedAt: Date;
}): TDocumentDefinitions {
  const { rows } = input;
  const generated = input.generatedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const header = ['Nome', 'E-mail', 'Telefone', 'Confirmou', 'Pacientes', 'Plano', 'Cadastro'].map((text) => ({
    text,
    bold: true,
  }));
  const body = rows.map((r) => [
    r.name,
    r.email,
    r.phone ?? '—',
    r.confirmed ? 'Sim' : 'Não',
    String(r.patientCount),
    ADMIN_PLAN_LABELS[r.plan],
    brDate(r.createdAt),
  ]);
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [32, 32, 32, 32],
    defaultStyle: { fontSize: 9 },
    content: [
      { text: 'Nutricionistas — iNutri', fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
      { text: `Gerado em ${generated}`, color: '#5b6b64', margin: [0, 0, 0, 2] },
      { text: describeFilters(input.filters), color: '#5b6b64', margin: [0, 0, 0, 2] },
      { text: `${rows.length} ${rows.length === 1 ? 'nutricionista' : 'nutricionistas'}`, margin: [0, 0, 0, 10] },
      rows.length
        ? {
            table: { headerRows: 1, widths: ['*', '*', 'auto', 'auto', 'auto', 'auto', 'auto'], body: [header, ...body] },
            layout: 'lightHorizontalLines',
          }
        : { text: 'Nenhuma nutricionista encontrada.', italics: true },
    ],
  };
}
```

Em `admin.service.ts` (importar `renderPdf` de `../meal-plans/pdf/pdf-printer` e `buildNutritionistsReportDoc`):

```ts
  async nutritionistsReport(f: AdminNutritionistFilters): Promise<{ buffer: Buffer; fileName: string }> {
    const generatedAt = new Date();
    const rows = await this.allNutritionists(f);
    const buffer = await renderPdf(buildNutritionistsReportDoc({ rows, filters: f, generatedAt }));
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(generatedAt);
    return { buffer, fileName: `nutricionistas-${day}.pdf` };
  }
```

Em `admin.controller.ts` — **antes** de qualquer rota `nutritionists/:id` (que a Task 4 adiciona), importar `StreamableFile` e `AdminNutritionistFiltersDto`:

```ts
  // Declarada antes de 'nutritionists/:id': senão "report.pdf" casaria como id.
  @Get('nutritionists/report.pdf')
  async nutritionistsReport(@Query() q: AdminNutritionistFiltersDto): Promise<StreamableFile> {
    const { buffer, fileName } = await this.admin.nutritionistsReport(q);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
```

- [ ] **Step 4: Rodar**

Run: `npx jest --config jest.config.ts src/admin` e `npx tsc --noEmit -p tsconfig.json`.
Expected: PASS; tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin
git commit -m "feat(api): relatório PDF da listagem de nutricionistas do painel admin"
```

---

### Task 4: Detalhe da nutricionista e listagem de pacientes

**Files:**
- Create: `apps/api/src/admin/dto/list-admin-patients.dto.ts`
- Modify: `apps/api/src/admin/admin.service.ts` (+spec), `admin.controller.ts`

**Interfaces:**
- Consumes: `planLabelOf` (Task 1), `inviteStatusOf` (`../patients/invite-status`), `preferredNutritionistName` (shared-types), `paginate` (Task 2).
- Produces:
  ```ts
  AdminService.nutritionistDetail(id: string): Promise<AdminNutritionistDetail>; // NotFoundException se não existir
  AdminService.listPatients(search: string | undefined, page: number, pageSize: number): Promise<Paginated<AdminPatientRow>>;
  // HTTP: GET /v1/admin/nutritionists/:id ; GET /v1/admin/patients?search&page&pageSize
  ```

- [ ] **Step 1: Testes (falhando)** — em `admin.service.spec.ts`:

```ts
describe('AdminService detail and patients', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: AdminService;
  const patientRow = {
    id: 'p1', name: 'Maria', email: 'm@x.com', phone: '5511', userId: 'u9', firstAppLoginAt: null,
    createdAt: new Date('2026-09-15T12:00:00Z'),
    nutritionist: { displayName: 'Dra. Ana', user: { name: 'Ana Souza' } },
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new AdminService(prisma, mockDeep<SupabaseAdminService>());
  });

  it('404 for an unknown nutritionist', async () => {
    prisma.nutritionistProfile.findUnique.mockResolvedValue(null);
    await expect(service.nutritionistDetail('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the nutritionist and her real patients, newest first', async () => {
    prisma.nutritionistProfile.findUnique.mockResolvedValue({
      id: 'n1', whatsappNumber: null,
      user: { name: 'Ana Souza', email: 'ana@x.com', createdAt: new Date('2026-09-01T12:00:00Z') },
      subscription: null, _count: { patients: 1 },
    } as any);
    prisma.patientProfile.findMany.mockResolvedValue([patientRow] as any);

    const res = await service.nutritionistDetail('n1');

    expect(res.nutritionist).toMatchObject({ id: 'n1', confirmed: true, plan: 'NONE', patientCount: 1 });
    expect(res.patients).toEqual([
      { id: 'p1', name: 'Maria', email: 'm@x.com', phone: '5511', nutritionistName: 'Dra. Ana', inviteStatus: 'INVITED', createdAt: '2026-09-15T12:00:00.000Z' },
    ]);
    expect(prisma.patientProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { nutritionistId: 'n1', isDemo: false }, orderBy: { createdAt: 'desc' } }),
    );
  });

  it('lists all real patients with search and pagination', async () => {
    prisma.patientProfile.count.mockResolvedValue(21);
    prisma.patientProfile.findMany.mockResolvedValue([patientRow] as any);

    const res = await service.listPatients('mar', 2, 20);

    expect(res).toMatchObject({ total: 21, page: 2, pageSize: 20, totalPages: 2 });
    const args = prisma.patientProfile.findMany.mock.calls[0][0] as any;
    expect(args.skip).toBe(20);
    expect(args.take).toBe(20);
    expect(args.where.isDemo).toBe(false);
    expect(JSON.stringify(args.where.OR)).toContain('"mode":"insensitive"');
  });
});
```

(Importar `NotFoundException` no topo do spec.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --config jest.config.ts src/admin/admin.service`
Expected: FAIL — `nutritionistDetail`/`listPatients` não são funções.

- [ ] **Step 3: Implementar**

`apps/api/src/admin/dto/list-admin-patients.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListAdminPatientsDto {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
```

Em `admin.service.ts` (imports: `NotFoundException`, `preferredNutritionistName`, tipos `AdminNutritionistDetail`, `AdminPatientRow`, `inviteStatusOf` de `../patients/invite-status`):

```ts
const PATIENT_SELECT = {
  id: true, name: true, email: true, phone: true, userId: true, firstAppLoginAt: true, createdAt: true,
  nutritionist: { select: { displayName: true, user: { select: { name: true } } } },
} as const;

function toPatientRow(p: {
  id: string; name: string; email: string | null; phone: string | null; userId: string | null;
  firstAppLoginAt: Date | null; createdAt: Date;
  nutritionist: { displayName: string | null; user: { name: string } } | null;
}): AdminPatientRow {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    nutritionistName: p.nutritionist
      ? preferredNutritionistName(p.nutritionist.displayName, p.nutritionist.user.name)
      : '—',
    inviteStatus: inviteStatusOf(p.userId, p.firstAppLoginAt),
    createdAt: p.createdAt.toISOString(),
  };
}

  async nutritionistDetail(id: string): Promise<AdminNutritionistDetail> {
    const p = await this.prisma.nutritionistProfile.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true, createdAt: true } },
        subscription: true,
        _count: { select: { patients: { where: { isDemo: false } } } },
      },
    });
    if (!p) throw new NotFoundException('Nutricionista não encontrada.');
    const patients = await this.prisma.patientProfile.findMany({
      where: { nutritionistId: id, isDemo: false },
      orderBy: { createdAt: 'desc' },
      select: PATIENT_SELECT,
    });
    return {
      nutritionist: {
        id: p.id,
        name: p.user.name,
        email: p.user.email,
        phone: p.whatsappNumber,
        confirmed: true,
        patientCount: p._count.patients,
        plan: planLabelOf(p.subscription, new Date()),
        createdAt: p.user.createdAt.toISOString(),
      },
      patients: patients.map(toPatientRow),
    };
  }

  async listPatients(search: string | undefined, page: number, pageSize: number): Promise<Paginated<AdminPatientRow>> {
    const term = search?.trim();
    const where = {
      isDemo: false,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' as const } },
              { email: { contains: term, mode: 'insensitive' as const } },
              { phone: { contains: term } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.patientProfile.count({ where }),
      this.prisma.patientProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: PATIENT_SELECT,
      }),
    ]);
    return { items: rows.map(toPatientRow), total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
```

Em `admin.controller.ts`, **depois** de `nutritionists/report.pdf`:

```ts
  @Get('nutritionists/:id')
  nutritionistDetail(@Param('id') id: string) {
    return this.admin.nutritionistDetail(id);
  }

  @Get('patients')
  listPatients(@Query() q: ListAdminPatientsDto) {
    return this.admin.listPatients(q.search, q.page ?? 1, q.pageSize ?? 20);
  }
```

- [ ] **Step 4: Rodar**

Run: `npx jest --config jest.config.ts src/admin`, depois a suíte inteira `npx jest --config jest.config.ts` e `npx tsc --noEmit -p tsconfig.json`.
Expected: tudo PASS; tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin
git commit -m "feat(api): detalhe da nutricionista e listagem de pacientes do painel admin"
```

---

### Task 5: Web — página `/admin` e aba Nutricionistas

**Files:**
- Create: `apps/web/src/lib/api/admin.ts`, `admin.test.ts`, `apps/web/src/lib/queries/admin.ts`, `apps/web/src/lib/admin/labels.ts`
- Create: `apps/web/src/app/(app)/admin/page.tsx`, `page.test.tsx`
- Create: `apps/web/src/components/admin/admin-view.tsx`, `nutritionists-tab.tsx`, `nutritionists-tab.test.tsx`

**Interfaces:**
- Consumes: HTTP das Tasks 2–4; `MeResponse.isAdmin` (Task 1); `ADMIN_PLAN_LABELS` e tipos (shared-types); `useDebouncedValue`; `useHorizontalOverflow`; `INVITE_STATUS_LABELS` (`@/lib/patients/labels`).
- Produces:
  ```ts
  // lib/api/admin.ts
  export function listAdminNutritionists(f: AdminNutritionistFilters, page: number, pageSize?: number): Promise<Paginated<AdminNutritionistRow>>;
  export function downloadAdminNutritionistsReport(f: AdminNutritionistFilters): Promise<void>;
  export function getAdminNutritionist(id: string): Promise<AdminNutritionistDetail>;
  export function listAdminPatients(search: string, page: number, pageSize?: number): Promise<Paginated<AdminPatientRow>>;
  export function adminQueryString(params: Record<string, string | number | undefined>): string;
  // lib/queries/admin.ts
  export function useAdminNutritionists(f: AdminNutritionistFilters, page: number): UseQueryResult<Paginated<AdminNutritionistRow>>;
  export function useAdminNutritionist(id: string): UseQueryResult<AdminNutritionistDetail>;
  export function useAdminPatients(search: string, page: number): UseQueryResult<Paginated<AdminPatientRow>>;
  // components
  export function AdminView(): JSX.Element;
  export function NutritionistsTab(): JSX.Element;
  ```

- [ ] **Step 1: Cliente da API (teste primeiro)**

`apps/web/src/lib/api/admin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
const browserApiDownload = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...a: unknown[]) => browserApiFetch(...a),
  browserApiDownload: (...a: unknown[]) => browserApiDownload(...a),
}));

import { adminQueryString, downloadAdminNutritionistsReport, listAdminNutritionists, listAdminPatients } from './admin';

beforeEach(() => {
  browserApiFetch.mockReset().mockResolvedValue({ items: [] });
  browserApiDownload.mockReset().mockResolvedValue(new Blob(['%PDF']));
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

describe('admin api', () => {
  it('builds a query string skipping empty values', () => {
    expect(adminQueryString({ search: 'ana', confirmed: undefined, plan: '', page: 2 })).toBe('?search=ana&page=2');
    expect(adminQueryString({})).toBe('');
  });

  it('lists nutritionists with filters and page', async () => {
    await listAdminNutritionists({ search: 'ana', confirmed: 'no', plan: 'TRIAL', createdFrom: '2026-09-01' }, 2);
    expect(browserApiFetch).toHaveBeenCalledWith(
      '/admin/nutritionists?search=ana&confirmed=no&plan=TRIAL&createdFrom=2026-09-01&page=2&pageSize=20',
    );
  });

  it('downloads the report with the active filters and no pagination', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      await downloadAdminNutritionistsReport({ plan: 'PRO' });
      expect(browserApiDownload).toHaveBeenCalledWith('/admin/nutritionists/report.pdf?plan=PRO');
      expect(click).toHaveBeenCalled();
    } finally {
      click.mockRestore();
    }
  });

  it('lists patients with search and page', async () => {
    await listAdminPatients('mar', 3);
    expect(browserApiFetch).toHaveBeenCalledWith('/admin/patients?search=mar&page=3&pageSize=20');
  });
});
```

Run (em `apps/web`): `npx vitest run src/lib/api/admin.test.ts` — Expected: FAIL (módulo inexistente).

`apps/web/src/lib/api/admin.ts`:

```ts
import type {
  AdminNutritionistDetail,
  AdminNutritionistFilters,
  AdminNutritionistRow,
  AdminPatientRow,
  Paginated,
} from '@nutri-plus/shared-types';
import { browserApiDownload, browserApiFetch } from '@/lib/api/browser';

export const ADMIN_PAGE_SIZE = 20;

export function adminQueryString(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

function filterParams(f: AdminNutritionistFilters) {
  return {
    search: f.search?.trim() || undefined,
    confirmed: f.confirmed,
    plan: f.plan,
    createdFrom: f.createdFrom,
    createdTo: f.createdTo,
  };
}

export function listAdminNutritionists(
  f: AdminNutritionistFilters,
  page: number,
  pageSize = ADMIN_PAGE_SIZE,
): Promise<Paginated<AdminNutritionistRow>> {
  return browserApiFetch(`/admin/nutritionists${adminQueryString({ ...filterParams(f), page, pageSize })}`);
}

// Todas as nutricionistas que passam nos filtros, num PDF (a API ignora paginação).
export async function downloadAdminNutritionistsReport(f: AdminNutritionistFilters): Promise<void> {
  const blob = await browserApiDownload(`/admin/nutritionists/report.pdf${adminQueryString(filterParams(f))}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nutricionistas.pdf';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getAdminNutritionist(id: string): Promise<AdminNutritionistDetail> {
  return browserApiFetch(`/admin/nutritionists/${id}`);
}

export function listAdminPatients(search: string, page: number, pageSize = ADMIN_PAGE_SIZE): Promise<Paginated<AdminPatientRow>> {
  return browserApiFetch(`/admin/patients${adminQueryString({ search: search.trim() || undefined, page, pageSize })}`);
}
```

(Conferir em `src/lib/api/browser.ts` que `browserApiDownload` aceita só o path; manter a assinatura existente.)

`apps/web/src/lib/queries/admin.ts`:

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AdminNutritionistFilters } from '@nutri-plus/shared-types';
import { getAdminNutritionist, listAdminNutritionists, listAdminPatients } from '@/lib/api/admin';

export function useAdminNutritionists(f: AdminNutritionistFilters, page: number) {
  return useQuery({
    queryKey: ['admin', 'nutritionists', f, page],
    queryFn: () => listAdminNutritionists(f, page),
    placeholderData: keepPreviousData,
  });
}

export function useAdminNutritionist(id: string) {
  return useQuery({ queryKey: ['admin', 'nutritionist', id], queryFn: () => getAdminNutritionist(id), enabled: Boolean(id) });
}

export function useAdminPatients(search: string, page: number) {
  return useQuery({
    queryKey: ['admin', 'patients', search, page],
    queryFn: () => listAdminPatients(search, page),
    placeholderData: keepPreviousData,
  });
}
```

`apps/web/src/lib/admin/labels.ts`:

```ts
// Datas do painel admin (instantes ISO) no dia de São Paulo.
export function formatAdminDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
```

Run: `npx vitest run src/lib/api/admin.test.ts` — Expected: PASS.

- [ ] **Step 2: Página e aba (teste primeiro)**

`apps/web/src/app/(app)/admin/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: () => getCurrentUser() }));
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('@/components/admin/admin-view', () => ({ AdminView: () => null }));

import AdminPage from './page';

beforeEach(() => {
  getCurrentUser.mockReset();
  notFound.mockClear();
});

describe('AdminPage', () => {
  it('is a 404 for users who are not admins', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u', role: 'NUTRITIONIST', isAdmin: false });
    await expect(AdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('is a 404 without a session', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(AdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders for an admin', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u', role: 'NUTRITIONIST', isAdmin: true });
    await expect(AdminPage()).resolves.toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });
});
```

`apps/web/src/components/admin/nutritionists-tab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useAdminNutritionists = vi.fn();
vi.mock('@/lib/queries/admin', () => ({
  useAdminNutritionists: (...a: unknown[]) => useAdminNutritionists(...a),
}));
const downloadReport = vi.fn();
vi.mock('@/lib/api/admin', () => ({ downloadAdminNutritionistsReport: (...a: unknown[]) => downloadReport(...a) }));
vi.mock('@/lib/hooks/use-debounced-value', () => ({ useDebouncedValue: (v: unknown) => v }));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { NutritionistsTab } from './nutritionists-tab';

const confirmedRow = {
  id: 'n1', name: 'Ana Souza', email: 'ana@x.com', phone: '5511999998888', confirmed: true,
  patientCount: 3, plan: 'PRO', createdAt: '2026-09-10T15:00:00.000Z',
};
const pendingRow = { ...confirmedRow, id: null, name: 'Pendente', email: 'p@x.com', confirmed: false, patientCount: 0, plan: 'NONE' };

function lastArgs() {
  return useAdminNutritionists.mock.calls.at(-1) as [Record<string, unknown>, number];
}

beforeEach(() => {
  useAdminNutritionists.mockReset().mockReturnValue({
    isLoading: false, isError: false, isFetching: false,
    data: { items: [confirmedRow, pendingRow], total: 41, page: 1, pageSize: 20, totalPages: 3 },
  });
  downloadReport.mockReset().mockResolvedValue(undefined);
  push.mockReset();
});

describe('NutritionistsTab', () => {
  it('renders the columns and rows', () => {
    render(<NutritionistsTab />);
    for (const h of ['Nome', 'E-mail', 'Telefone', 'Confirmou', 'Pacientes', 'Plano', 'Cadastro']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Sem plano')).toBeInTheDocument();
    expect(screen.getByText('41 nutricionistas')).toBeInTheDocument();
  });

  it('sends the filters to the query and goes back to page 1 on change', async () => {
    render(<NutritionistsTab />);
    await userEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(lastArgs()[1]).toBe(2);

    await userEvent.selectOptions(screen.getByLabelText(/confirmou/i), 'no');
    expect(lastArgs()).toEqual([expect.objectContaining({ confirmed: 'no' }), 1]);

    await userEvent.selectOptions(screen.getByLabelText(/^plano$/i), 'TRIAL');
    await userEvent.type(screen.getByLabelText(/buscar/i), 'ana');
    await userEvent.type(screen.getByLabelText(/cadastro de/i), '2026-09-01');
    expect(lastArgs()[0]).toEqual(
      expect.objectContaining({ confirmed: 'no', plan: 'TRIAL', search: 'ana', createdFrom: '2026-09-01' }),
    );
  });

  it('opens the detail of a confirmed nutritionist, not of a pending one', async () => {
    render(<NutritionistsTab />);
    await userEvent.click(screen.getByText('Ana Souza'));
    expect(push).toHaveBeenCalledWith('/admin/nutritionists/n1');
    push.mockReset();
    await userEvent.click(screen.getByText('Pendente'));
    expect(push).not.toHaveBeenCalled();
  });

  it('downloads the PDF with the active filters', async () => {
    render(<NutritionistsTab />);
    await userEvent.selectOptions(screen.getByLabelText(/^plano$/i), 'PRO');
    await userEvent.click(screen.getByRole('button', { name: /baixar relatório/i }));
    await waitFor(() => expect(downloadReport).toHaveBeenCalledWith(expect.objectContaining({ plan: 'PRO' })));
  });
});
```

Run: `npx vitest run "src/app/(app)/admin" src/components/admin` — Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar página, view e aba**

`apps/web/src/app/(app)/admin/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { AdminView } from '@/components/admin/admin-view';
import { getCurrentUser } from '@/lib/auth/current-user';

// Painel oculto: nenhum link aponta para cá. Quem não é admin vê o 404 normal,
// sem pista de que a página existe; a API também responde 404 para essas rotas.
export default async function AdminPage() {
  const me = await getCurrentUser();
  if (!me?.isAdmin) notFound();
  return <AdminView />;
}
```

`apps/web/src/components/admin/admin-view.tsx`:

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NutritionistsTab } from './nutritionists-tab';
import { PatientsTab } from './patients-tab';

type AdminTab = 'nutricionistas' | 'pacientes';

export function AdminView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: AdminTab = searchParams.get('tab') === 'pacientes' ? 'pacientes' : 'nutricionistas';

  return (
    <div className="space-y-5">
      <h1 className="font-heading text-2xl font-bold">Painel de administração</h1>
      <Tabs value={tab} onValueChange={(v) => router.replace(`/admin?tab=${v}`)}>
        <TabsList>
          <TabsTrigger value="nutricionistas">Nutricionistas</TabsTrigger>
          <TabsTrigger value="pacientes">Pacientes</TabsTrigger>
        </TabsList>
        <TabsContent value="nutricionistas">
          <NutritionistsTab />
        </TabsContent>
        <TabsContent value="pacientes">
          <PatientsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

(A `PatientsTab` vem na Task 6. Para esta task compilar e testar, criar já `components/admin/patients-tab.tsx` com `export function PatientsTab() { return null; }` — a Task 6 substitui o corpo.)

`apps/web/src/components/admin/nutritionists-tab.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ADMIN_PLAN_LABELS, type AdminNutritionistFilters, type AdminPlanLabel } from '@nutri-plus/shared-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadAdminNutritionistsReport } from '@/lib/api/admin';
import { formatAdminDate } from '@/lib/admin/labels';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useHorizontalOverflow } from '@/lib/hooks/use-horizontal-overflow';
import { useAdminNutritionists } from '@/lib/queries/admin';

const SELECT_CLASS =
  'h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';
const PINNED_CELL = 'sticky left-0 z-10 bg-card';
const PINNED_DIVIDER = 'shadow-[inset_-1px_0_0_var(--border)]';

export function NutritionistsTab() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [confirmed, setConfirmed] = useState<'' | 'yes' | 'no'>('');
  const [plan, setPlan] = useState<'' | AdminPlanLabel>('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [tableBoxRef, tableOverflows] = useHorizontalOverflow<HTMLDivElement>();
  const debouncedSearch = useDebouncedValue(search, 300);

  const filters: AdminNutritionistFilters = {
    search: debouncedSearch.trim() || undefined,
    confirmed: confirmed || undefined,
    plan: plan || undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
  };
  const query = useAdminNutritionists(filters, page);
  const data = query.data;

  // Mudar qualquer filtro volta para a primeira página.
  function onFilter<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  async function download() {
    setDownloading(true);
    try {
      await downloadAdminNutritionistsReport(filters);
    } catch {
      toast.error('Não foi possível gerar o relatório.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Buscar</span>
          <Input
            aria-label="Buscar"
            placeholder="Nome ou e-mail"
            value={search}
            onChange={(e) => onFilter(setSearch)(e.target.value)}
            className="w-64"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Confirmou</span>
          <select aria-label="Confirmou" className={SELECT_CLASS} value={confirmed} onChange={(e) => onFilter(setConfirmed)(e.target.value as '' | 'yes' | 'no')}>
            <option value="">Todos</option>
            <option value="yes">Sim</option>
            <option value="no">Não</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Plano</span>
          <select aria-label="Plano" className={SELECT_CLASS} value={plan} onChange={(e) => onFilter(setPlan)(e.target.value as '' | AdminPlanLabel)}>
            <option value="">Todos</option>
            {(Object.keys(ADMIN_PLAN_LABELS) as AdminPlanLabel[]).map((k) => (
              <option key={k} value={k}>
                {ADMIN_PLAN_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Cadastro de</span>
          <Input aria-label="Cadastro de" type="date" value={createdFrom} onChange={(e) => onFilter(setCreatedFrom)(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">até</span>
          <Input aria-label="Cadastro até" type="date" value={createdTo} onChange={(e) => onFilter(setCreatedTo)(e.target.value)} />
        </label>
        <Button type="button" variant="outline" className="ml-auto rounded-full" onClick={download} disabled={downloading}>
          {downloading ? 'Gerando…' : 'Baixar relatório (PDF)'}
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Não foi possível carregar as nutricionistas.
        </p>
      ) : data ? (
        <>
          <p className="text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? 'nutricionista' : 'nutricionistas'}
          </p>
          <div ref={tableBoxRef} className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className={`${PINNED_CELL} ${tableOverflows ? PINNED_DIVIDER : ''} px-4 py-3 font-semibold`}>Nome</th>
                  <th className="px-4 py-3 font-semibold">E-mail</th>
                  <th className="px-4 py-3 font-semibold">Telefone</th>
                  <th className="px-4 py-3 font-semibold">Confirmou</th>
                  <th className="px-4 py-3 font-semibold">Pacientes</th>
                  <th className="px-4 py-3 font-semibold">Plano</th>
                  <th className="px-4 py-3 font-semibold">Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhuma nutricionista encontrada.
                    </td>
                  </tr>
                ) : (
                  data.items.map((n) => (
                    <tr
                      key={n.id ?? n.email}
                      // Quem não confirmou não tem perfil (nem pacientes): sem detalhe.
                      onClick={n.id ? () => router.push(`/admin/nutritionists/${n.id}`) : undefined}
                      className={`group border-b last:border-0 ${n.id ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                    >
                      <td className={`${PINNED_CELL} ${tableOverflows ? PINNED_DIVIDER : ''} px-4 py-3 font-semibold ${n.id ? 'group-hover:bg-[color-mix(in_oklab,var(--card),var(--muted)_40%)]' : ''}`}>
                        <span className="block max-w-[14rem] truncate" title={n.name}>{n.name}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="block max-w-[16rem] truncate" title={n.email}>{n.email}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{n.phone ?? '—'}</td>
                      <td className="px-4 py-3">{n.confirmed ? 'Sim' : 'Não'}</td>
                      <td className="px-4 py-3">{n.patientCount}</td>
                      <td className="px-4 py-3">{ADMIN_PLAN_LABELS[n.plan]}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatAdminDate(n.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Anterior
              </Button>
              <span className="text-muted-foreground">Página {data.page} de {data.totalPages}</span>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setPage((p) => p + 1)} disabled={page >= data.totalPages}>
                Próxima
              </Button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run src/lib/api/admin.test.ts "src/app/(app)/admin" src/components/admin`; `npx tsc --noEmit` (baseline 8); `npx eslint src/components/admin src/lib/api/admin.ts src/lib/queries/admin.ts "src/app/(app)/admin"`.
Expected: PASS; sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api/admin.ts apps/web/src/lib/api/admin.test.ts apps/web/src/lib/queries/admin.ts apps/web/src/lib/admin apps/web/src/components/admin "apps/web/src/app/(app)/admin"
git commit -m "feat(web): painel admin oculto com a listagem de nutricionistas"
```

---

### Task 6: Web — aba Pacientes e detalhe da nutricionista

**Files:**
- Modify: `apps/web/src/components/admin/patients-tab.tsx` (substitui o stub da Task 5)
- Create: `apps/web/src/components/admin/patients-tab.test.tsx`, `nutritionist-detail.tsx`, `nutritionist-detail.test.tsx`
- Create: `apps/web/src/app/(app)/admin/nutritionists/[id]/page.tsx`

**Interfaces:**
- Consumes: `useAdminPatients`, `useAdminNutritionist` (Task 5), `formatAdminDate`, `INVITE_STATUS_LABELS`, `ADMIN_PLAN_LABELS`.
- Produces: `export function PatientsTab(): JSX.Element;` `export function AdminNutritionistDetail({ id }: { id: string }): JSX.Element;`

- [ ] **Step 1: Testes (falhando)**

`apps/web/src/components/admin/patients-tab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useAdminPatients = vi.fn();
vi.mock('@/lib/queries/admin', () => ({ useAdminPatients: (...a: unknown[]) => useAdminPatients(...a) }));
vi.mock('@/lib/hooks/use-debounced-value', () => ({ useDebouncedValue: (v: unknown) => v }));

import { PatientsTab } from './patients-tab';

beforeEach(() => {
  useAdminPatients.mockReset().mockReturnValue({
    isLoading: false, isError: false,
    data: {
      items: [{ id: 'p1', name: 'Maria', email: 'm@x.com', phone: '5511', nutritionistName: 'Dra. Ana', inviteStatus: 'ACTIVE', createdAt: '2026-09-15T12:00:00.000Z' }],
      total: 25, page: 1, pageSize: 20, totalPages: 2,
    },
  });
});

describe('PatientsTab', () => {
  it('renders the patients with their nutritionist and app status', () => {
    render(<PatientsTab />);
    for (const h of ['Paciente', 'E-mail', 'Telefone', 'Nutricionista', 'Status do app', 'Cadastro']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText('25 pacientes')).toBeInTheDocument();
  });

  it('searches from page 1 and paginates', async () => {
    render(<PatientsTab />);
    await userEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(useAdminPatients.mock.calls.at(-1)).toEqual(['', 2]);
    await userEvent.type(screen.getByLabelText(/buscar/i), 'mar');
    expect(useAdminPatients.mock.calls.at(-1)).toEqual(['mar', 1]);
  });
});
```

`apps/web/src/components/admin/nutritionist-detail.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useAdminNutritionist = vi.fn();
vi.mock('@/lib/queries/admin', () => ({ useAdminNutritionist: (id: string) => useAdminNutritionist(id) }));

import { AdminNutritionistDetail } from './nutritionist-detail';

describe('AdminNutritionistDetail', () => {
  it('shows the nutritionist header and her patients', () => {
    useAdminNutritionist.mockReturnValue({
      isLoading: false, isError: false,
      data: {
        nutritionist: { id: 'n1', name: 'Ana Souza', email: 'ana@x.com', phone: null, confirmed: true, patientCount: 1, plan: 'COMP', createdAt: '2026-09-01T12:00:00.000Z' },
        patients: [{ id: 'p1', name: 'Maria', email: null, phone: null, nutritionistName: 'Ana Souza', inviteStatus: 'NOT_INVITED', createdAt: '2026-09-15T12:00:00.000Z' }],
      },
    });
    render(<AdminNutritionistDetail id="n1" />);
    expect(useAdminNutritionist).toHaveBeenCalledWith('n1');
    expect(screen.getByRole('heading', { name: 'Ana Souza' })).toBeInTheDocument();
    expect(screen.getByText('Cortesia')).toBeInTheDocument();
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voltar para o painel/i })).toHaveAttribute('href', '/admin');
  });

  it('shows an empty state without patients', () => {
    useAdminNutritionist.mockReturnValue({
      isLoading: false, isError: false,
      data: {
        nutritionist: { id: 'n1', name: 'Ana', email: 'a@x.com', phone: null, confirmed: true, patientCount: 0, plan: 'NONE', createdAt: '2026-09-01T12:00:00.000Z' },
        patients: [],
      },
    });
    render(<AdminNutritionistDetail id="n1" />);
    expect(screen.getByText('Nenhum paciente cadastrado.')).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/admin/patients-tab.test.tsx src/components/admin/nutritionist-detail.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`apps/web/src/components/admin/patients-tab.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useAdminPatients } from '@/lib/queries/admin';
import { AdminPatientsTable } from './nutritionist-detail';

// Todos os pacientes (reais) de todas as nutricionistas. Sem dados clínicos.
export function PatientsTab() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search, 300);
  const query = useAdminPatients(debounced.trim(), page);
  const data = query.data;

  return (
    <div className="space-y-4">
      <label className="block max-w-sm space-y-1 text-sm">
        <span className="block text-muted-foreground">Buscar</span>
        <Input
          aria-label="Buscar"
          placeholder="Nome, e-mail ou telefone"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </label>
      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Não foi possível carregar os pacientes.</p>
      ) : data ? (
        <>
          <p className="text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? 'paciente' : 'pacientes'}
          </p>
          <AdminPatientsTable patients={data.items} showNutritionist />
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Anterior
              </Button>
              <span className="text-muted-foreground">Página {data.page} de {data.totalPages}</span>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setPage((p) => p + 1)} disabled={page >= data.totalPages}>
                Próxima
              </Button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
```

`apps/web/src/components/admin/nutritionist-detail.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ADMIN_PLAN_LABELS, type AdminPatientRow } from '@nutri-plus/shared-types';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAdminDate } from '@/lib/admin/labels';
import { INVITE_STATUS_LABELS } from '@/lib/patients/labels';
import { useAdminNutritionist } from '@/lib/queries/admin';

// Tabela de pacientes do painel admin (aba Pacientes e detalhe da nutricionista).
export function AdminPatientsTable({ patients, showNutritionist = false }: { patients: AdminPatientRow[]; showNutritionist?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-semibold">Paciente</th>
            <th className="px-4 py-3 font-semibold">E-mail</th>
            <th className="px-4 py-3 font-semibold">Telefone</th>
            {showNutritionist && <th className="px-4 py-3 font-semibold">Nutricionista</th>}
            <th className="px-4 py-3 font-semibold">Status do app</th>
            <th className="px-4 py-3 font-semibold">Cadastro</th>
          </tr>
        </thead>
        <tbody>
          {patients.length === 0 ? (
            <tr>
              <td colSpan={showNutritionist ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                Nenhum paciente cadastrado.
              </td>
            </tr>
          ) : (
            patients.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-semibold">
                  <span className="block max-w-[14rem] truncate" title={p.name}>{p.name}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="block max-w-[16rem] truncate" title={p.email ?? undefined}>{p.email ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.phone ?? '—'}</td>
                {showNutritionist && <td className="px-4 py-3">{p.nutritionistName}</td>}
                <td className="px-4 py-3">{INVITE_STATUS_LABELS[p.inviteStatus]}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatAdminDate(p.createdAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AdminNutritionistDetail({ id }: { id: string }) {
  const query = useAdminNutritionist(id);
  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError || !query.data) {
    return <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Nutricionista não encontrada.</p>;
  }
  const { nutritionist: n, patients } = query.data;
  return (
    <div className="space-y-5">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Voltar para o painel
      </Link>
      <div className="space-y-1 rounded-xl border bg-card p-5">
        <h1 className="font-heading text-2xl font-bold">{n.name}</h1>
        <p className="text-sm text-muted-foreground">
          {n.email} · {n.phone ?? 'sem telefone'}
        </p>
        <p className="text-sm">
          Plano: <strong>{ADMIN_PLAN_LABELS[n.plan]}</strong> · {n.patientCount}{' '}
          {n.patientCount === 1 ? 'paciente' : 'pacientes'} · desde {formatAdminDate(n.createdAt)}
        </p>
      </div>
      <AdminPatientsTable patients={patients} />
    </div>
  );
}
```

`apps/web/src/app/(app)/admin/nutritionists/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { AdminNutritionistDetail } from '@/components/admin/nutritionist-detail';
import { getCurrentUser } from '@/lib/auth/current-user';

export default async function AdminNutritionistPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) notFound();
  const { id } = await params;
  return <AdminNutritionistDetail id={id} />;
}
```

(Conferir em outra página dinâmica, ex. `app/(app)/patients/[id]/page.tsx`, se `params` é `Promise` neste projeto e seguir o mesmo formato.)

- [ ] **Step 3: Rodar e verificação completa**

Run (em `apps/web`): `npx vitest run` (suíte inteira); `npx tsc --noEmit` (baseline 8); `npx eslint src/components/admin "src/app/(app)/admin" src/lib/api/admin.ts src/lib/queries/admin.ts src/lib/admin`.
Expected: PASS; sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin "apps/web/src/app/(app)/admin"
git commit -m "feat(web): aba Pacientes e detalhe da nutricionista no painel admin"
```
