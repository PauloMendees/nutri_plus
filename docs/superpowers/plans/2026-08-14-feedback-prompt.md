# Feedback Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prompt automático de feedback 1–5 (web do nutricionista após 72h; app do paciente após 168h do primeiro login), com persistência, e-mail ao time e review na loja só para nota 4–5.

**Architecture:** O servidor é dono do ciclo. `GET /v1/feedback/prompt` calcula `shouldShow` e, no paciente, grava `firstAppLoginAt` na primeira visita. `POST /v1/feedback` envia e-mail via Resend e só então persiste nota + `resolvedAt`. `POST /v1/feedback/dismiss` aplica folga de 168h e, na segunda recusa, resolve para sempre. Web e mobile só perguntam e reagem.

**Tech Stack:** NestJS 10 · Prisma 7 · Jest (API + mobile) · Vitest (web) · Next.js 16 · Expo 54 · `expo-store-review` · Resend (`ResendService` existente) · `@nutri-plus/shared-types`.

**Spec:** `docs/superpowers/specs/2026-08-14-feedback-prompt-design.md`

## Global Constraints

- Janelas no relógio do servidor: nutricionista **72h** após `User.createdAt`; paciente **168h** após `PatientProfile.firstAppLoginAt`; snooze **168h**. Não são dias de calendário.
- Uma linha `UserFeedback` por usuário. `resolvedAt` preenchido = nunca mais mostra.
- Comentário opcional, trim, máx. **2000** chars; string vazia → `null`.
- `source` sai do **role** (`NUTRITIONIST` → `WEB`, `PATIENT` → `MOBILE`). Cliente não envia `source`.
- Funcionário: GET `shouldShow: false` (sem stamp de `firstAppLoginAt`); POST 403.
- E-mail só no submit. Env ausente → 503; Resend falha → 502; **não** escreve `rating` / `resolvedAt` se o e-mail falhar.
- Sem env novo. Reusa `RESEND_API_KEY`, `SUPPORT_INBOX_EMAIL`, `SUPPORT_FROM_EMAIL`.
- Copy em **pt-BR**. Aspas da API: single quotes.
- Sem painel admin, sem item de menu, sem banner, sem prompt para funcionário.
- Testes API: `pnpm --filter @nutri-plus/api test <file>`
- Testes web: `pnpm --filter @nutri-plus/web test <file>`
- Testes mobile: `pnpm --filter @nutri-plus/mobile test <file>`
- Branch `feat/feedback-prompt`. Não push/PR neste plano.

---

## File Structure

- Create `packages/shared-types/src/v1/feedback.ts` — tipos e constantes do contrato.
- Modify `packages/shared-types/src/v1/index.ts` — reexport.
- Modify `apps/api/prisma/schema.prisma` — enum `FeedbackSource`, model `UserFeedback`, `User.feedback`, `PatientProfile.firstAppLoginAt`.
- Create `apps/api/prisma/migrations/20260814120000_user_feedback_and_first_app_login/migration.sql`.
- Create `apps/api/src/feedback/feedback-email.ts` — builder puro do e-mail.
- Create `apps/api/src/feedback/feedback-email.spec.ts`.
- Create `apps/api/src/feedback/feedback.service.ts` — máquina de estados.
- Create `apps/api/src/feedback/feedback.service.spec.ts`.
- Create `apps/api/src/feedback/dto/submit-feedback.dto.ts`.
- Create `apps/api/src/feedback/feedback.controller.ts`.
- Create `apps/api/src/feedback/feedback.module.ts`.
- Modify `apps/api/src/app.module.ts` — importar `FeedbackModule`.
- Create `apps/web/src/lib/api/feedback.ts` — client HTTP.
- Create `apps/web/src/lib/queries/feedback.ts` — react-query.
- Create `apps/web/src/components/feedback/feedback-dialog.tsx`.
- Create `apps/web/src/components/feedback/feedback-dialog.test.tsx`.
- Create `apps/web/src/components/feedback/feedback-prompt-host.tsx`.
- Modify `apps/web/src/app/(app)/layout.tsx` — montar o host depois dos gates.
- Create `apps/mobile/lib/store-review.ts` — nativo + fallback da loja.
- Create `apps/mobile/lib/store-review.test.ts`.
- Create `apps/mobile/lib/queries/feedback.ts`.
- Create `apps/mobile/components/feedback/feedback-prompt.tsx`.
- Create `apps/mobile/components/feedback/feedback-prompt.test.tsx`.
- Modify `apps/mobile/app/(app)/_layout.tsx` — GET + dialog depois do consent.
- Modify `apps/mobile/app.config.js` — `extra.appleAppId`.
- Modify `apps/mobile/package.json` — `expo-store-review`.

---

### Task 1: Schema Prisma + shared types

**Files:**
- Create: `packages/shared-types/src/v1/feedback.ts`
- Modify: `packages/shared-types/src/v1/index.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260814120000_user_feedback_and_first_app_login/migration.sql`

**Interfaces:**
- Produces: `FeedbackSource`, `FEEDBACK_SOURCES`, `FeedbackPromptResponse`, `SubmitFeedbackRequest`, `SubmitFeedbackResponse`, `DismissFeedbackResponse`
- Produces: `NUTRITIONIST_PROMPT_DELAY_MS = 72 * 60 * 60 * 1000`
- Produces: `PATIENT_PROMPT_DELAY_MS = 168 * 60 * 60 * 1000`
- Produces: `FEEDBACK_SNOOZE_MS = 168 * 60 * 60 * 1000`
- Produces: `FEEDBACK_COMMENT_MAX = 2000`
- Produces: Prisma `UserFeedback`, `FeedbackSource`, `PatientProfile.firstAppLoginAt`, `User.feedback`

- [ ] **Step 1: Criar os shared types**

`packages/shared-types/src/v1/feedback.ts`:

```ts
export const FEEDBACK_SOURCES = ['WEB', 'MOBILE'] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const NUTRITIONIST_PROMPT_DELAY_MS = 72 * 60 * 60 * 1000;
export const PATIENT_PROMPT_DELAY_MS = 168 * 60 * 60 * 1000;
export const FEEDBACK_SNOOZE_MS = 168 * 60 * 60 * 1000;
export const FEEDBACK_COMMENT_MAX = 2000;

export interface FeedbackPromptResponse {
  shouldShow: boolean;
  source: FeedbackSource;
}

export interface SubmitFeedbackRequest {
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}

export interface SubmitFeedbackResponse {
  ok: true;
}

export interface DismissFeedbackResponse {
  ok: true;
}
```

Em `packages/shared-types/src/v1/index.ts` adicionar `export * from './feedback';` no final.

- [ ] **Step 2: Build dos types**

Run: `pnpm --filter @nutri-plus/shared-types build`

Expected: PASS (exit 0)

- [ ] **Step 3: Schema Prisma**

Em `model User`, depois de `employeeProfile EmployeeProfile?`, adicionar:

```prisma
  feedback UserFeedback?
```

Em `model PatientProfile`, depois de `photoUrl String?`, adicionar:

```prisma
  firstAppLoginAt DateTime?
```

Depois do enum `SubscriptionStatus` (ou no bloco de enums), adicionar:

```prisma
enum FeedbackSource {
  WEB
  MOBILE
}
```

No final do schema, adicionar o model:

```prisma
model UserFeedback {
  id           String          @id @default(uuid())
  userId       String          @unique
  user         User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  rating       Int?
  comment      String?
  source       FeedbackSource?
  dismissCount Int             @default(0)
  snoozedUntil DateTime?
  resolvedAt   DateTime?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
}
```

- [ ] **Step 4: Migration SQL**

Criar `apps/api/prisma/migrations/20260814120000_user_feedback_and_first_app_login/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "FeedbackSource" AS ENUM ('WEB', 'MOBILE');

-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN "firstAppLoginAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "source" "FeedbackSource",
    "dismissCount" INTEGER NOT NULL DEFAULT 0,
    "snoozedUntil" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserFeedback_userId_key" ON "UserFeedback"("userId");

-- AddForeignKey
ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Gerar o client Prisma**

Run: `pnpm --filter @nutri-plus/api prisma:generate`

Expected: PASS. `UserFeedback` e `firstAppLoginAt` existem em `apps/api/src/generated/prisma`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/v1/feedback.ts packages/shared-types/src/v1/index.ts apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260814120000_user_feedback_and_first_app_login
git commit -m "feat(api): add UserFeedback schema and shared feedback types"
```

---

### Task 2: FeedbackService.getPrompt

**Files:**
- Create: `apps/api/src/feedback/feedback.service.ts`
- Create: `apps/api/src/feedback/feedback.service.spec.ts`

**Interfaces:**
- Consumes: `AuthContext` (`apps/api/src/auth/types/auth-context.ts`), `PrismaService`, types da Task 1
- Produces: `FeedbackService.getPrompt(ctx: AuthContext): Promise<FeedbackPromptResponse>`

- [ ] **Step 1: Escrever os testes de `getPrompt`**

`apps/api/src/feedback/feedback.service.spec.ts`:

```ts
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import {
  FEEDBACK_SNOOZE_MS,
  NUTRITIONIST_PROMPT_DELAY_MS,
  PATIENT_PROMPT_DELAY_MS,
} from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { UserRole } from '../generated/prisma/client';
import { FeedbackService } from './feedback.service';

const NOW = new Date('2026-08-14T12:00:00.000Z');

function ctx(partial: {
  role: UserRole;
  createdAt?: Date;
  patientProfile?: { id: string; firstAppLoginAt: Date | null } | null;
}): AuthContext {
  return {
    authProviderId: 'sub',
    email: 'a@x.com',
    name: 'Ana',
    user: {
      id: 'u1',
      authProvider: 'supabase',
      authProviderId: 'sub',
      email: 'a@x.com',
      name: 'Ana',
      role: partial.role,
      createdAt: partial.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: NOW,
      nutritionistProfile: partial.role === UserRole.NUTRITIONIST ? { id: 'n1' } : null,
      patientProfile: partial.role === UserRole.PATIENT ? (partial.patientProfile ?? { id: 'p1', firstAppLoginAt: null }) : null,
      employeeProfile: partial.role === UserRole.EMPLOYEE ? { id: 'e1' } : null,
    },
  } as unknown as AuthContext;
}

describe('FeedbackService.getPrompt', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let svc: FeedbackService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prisma = mockDeep<PrismaService>();
    prisma.userFeedback.findUnique.mockResolvedValue(null);
    svc = new FeedbackService(prisma, { get: () => undefined } as any, { sendSupportEmail: jest.fn() } as any);
  });

  afterEach(() => jest.useRealTimers());

  it('funcionário sempre shouldShow=false e não stamp firstAppLoginAt', async () => {
    const out = await svc.getPrompt(ctx({ role: UserRole.EMPLOYEE }));
    expect(out).toEqual({ shouldShow: false, source: 'WEB' });
    expect(prisma.patientProfile.update).not.toHaveBeenCalled();
  });

  it('nutricionista com conta < 72h → false', async () => {
    const createdAt = new Date(NOW.getTime() - NUTRITIONIST_PROMPT_DELAY_MS + 1_000);
    const out = await svc.getPrompt(ctx({ role: UserRole.NUTRITIONIST, createdAt }));
    expect(out).toEqual({ shouldShow: false, source: 'WEB' });
  });

  it('nutricionista com conta ≥ 72h sem linha → true', async () => {
    const createdAt = new Date(NOW.getTime() - NUTRITIONIST_PROMPT_DELAY_MS);
    const out = await svc.getPrompt(ctx({ role: UserRole.NUTRITIONIST, createdAt }));
    expect(out).toEqual({ shouldShow: true, source: 'WEB' });
  });

  it('paciente no primeiro GET stamp firstAppLoginAt e retorna false', async () => {
    prisma.patientProfile.update.mockResolvedValue({} as any);
    const out = await svc.getPrompt(
      ctx({ role: UserRole.PATIENT, patientProfile: { id: 'p1', firstAppLoginAt: null } }),
    );
    expect(out).toEqual({ shouldShow: false, source: 'MOBILE' });
    expect(prisma.patientProfile.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { firstAppLoginAt: NOW },
    });
  });

  it('paciente com firstAppLoginAt < 168h → false sem novo stamp', async () => {
    const first = new Date(NOW.getTime() - PATIENT_PROMPT_DELAY_MS + 1_000);
    const out = await svc.getPrompt(
      ctx({ role: UserRole.PATIENT, patientProfile: { id: 'p1', firstAppLoginAt: first } }),
    );
    expect(out).toEqual({ shouldShow: false, source: 'MOBILE' });
    expect(prisma.patientProfile.update).not.toHaveBeenCalled();
  });

  it('paciente com firstAppLoginAt ≥ 168h → true', async () => {
    const first = new Date(NOW.getTime() - PATIENT_PROMPT_DELAY_MS);
    const out = await svc.getPrompt(
      ctx({ role: UserRole.PATIENT, patientProfile: { id: 'p1', firstAppLoginAt: first } }),
    );
    expect(out).toEqual({ shouldShow: true, source: 'MOBILE' });
  });

  it('resolvedAt preenchido → false', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue({ resolvedAt: NOW } as any);
    const out = await svc.getPrompt(ctx({ role: UserRole.NUTRITIONIST }));
    expect(out.shouldShow).toBe(false);
  });

  it('snoozedUntil no futuro → false; depois do snooze → true', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue({
      resolvedAt: null,
      snoozedUntil: new Date(NOW.getTime() + 1_000),
      dismissCount: 1,
    } as any);
    const during = await svc.getPrompt(ctx({ role: UserRole.NUTRITIONIST }));
    expect(during.shouldShow).toBe(false);

    prisma.userFeedback.findUnique.mockResolvedValue({
      resolvedAt: null,
      snoozedUntil: new Date(NOW.getTime() - 1_000),
      dismissCount: 1,
    } as any);
    const after = await svc.getPrompt(ctx({ role: UserRole.NUTRITIONIST }));
    expect(after.shouldShow).toBe(true);
  });
});
```

O construtor neste teste antecipa `PrismaService`, `ConfigService`, `ResendService` — use essa ordem e mantenha nas Tasks 3–4.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/api test feedback.service`

Expected: FAIL (`Cannot find module './feedback.service'` ou `FeedbackService is not a function`)

- [ ] **Step 3: Implementar `getPrompt`**

`apps/api/src/feedback/feedback.service.ts`:

```ts
import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FEEDBACK_SNOOZE_MS,
  NUTRITIONIST_PROMPT_DELAY_MS,
  PATIENT_PROMPT_DELAY_MS,
  type FeedbackPromptResponse,
  type FeedbackSource,
  type SubmitFeedbackRequest,
  type SubmitFeedbackResponse,
  type DismissFeedbackResponse,
} from '@nutri-plus/shared-types';
import { UserRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { ResendService } from '../support/resend.service';

function sourceFor(role: UserRole): FeedbackSource {
  return role === UserRole.PATIENT ? 'MOBILE' : 'WEB';
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly resend: ResendService,
  ) {}

  async getPrompt(ctx: AuthContext): Promise<FeedbackPromptResponse> {
    const user = ctx.user!;
    const source = sourceFor(user.role);
    if (user.role === UserRole.EMPLOYEE) {
      return { shouldShow: false, source };
    }

    const row = await this.prisma.userFeedback.findUnique({ where: { userId: user.id } });
    if (row?.resolvedAt) return { shouldShow: false, source };
    if (row?.snoozedUntil && row.snoozedUntil > new Date()) {
      return { shouldShow: false, source };
    }

    if (user.role === UserRole.NUTRITIONIST) {
      const readyAt = new Date(user.createdAt.getTime() + NUTRITIONIST_PROMPT_DELAY_MS);
      return { shouldShow: new Date() >= readyAt, source };
    }

    const profile = user.patientProfile;
    if (!profile) return { shouldShow: false, source };
    if (!profile.firstAppLoginAt) {
      const now = new Date();
      await this.prisma.patientProfile.update({
        where: { id: profile.id },
        data: { firstAppLoginAt: now },
      });
      return { shouldShow: false, source };
    }
    const readyAt = new Date(profile.firstAppLoginAt.getTime() + PATIENT_PROMPT_DELAY_MS);
    return { shouldShow: new Date() >= readyAt, source };
  }

  async dismiss(_ctx: AuthContext): Promise<DismissFeedbackResponse> {
    throw new Error('not implemented');
  }

  async submit(_ctx: AuthContext, _dto: SubmitFeedbackRequest): Promise<SubmitFeedbackResponse> {
    throw new Error('not implemented');
  }
}
```

- [ ] **Step 4: Rodar os testes de getPrompt**

Run: `pnpm --filter @nutri-plus/api test feedback.service`

Expected: PASS nos casos de `getPrompt`. Os `describe` de dismiss/submit ainda não existem.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/feedback/feedback.service.ts apps/api/src/feedback/feedback.service.spec.ts
git commit -m "feat(api): compute feedback prompt eligibility"
```

---

### Task 3: FeedbackService.dismiss

**Files:**
- Modify: `apps/api/src/feedback/feedback.service.ts`
- Modify: `apps/api/src/feedback/feedback.service.spec.ts`

**Interfaces:**
- Consumes: `getPrompt` helpers e `PrismaService` da Task 2
- Produces: `dismiss(ctx: AuthContext): Promise<DismissFeedbackResponse>`
- 1º dismiss (sem linha ou `dismissCount === 0`): upsert `dismissCount = 1`, `snoozedUntil = now + FEEDBACK_SNOOZE_MS`
- 2º dismiss (`dismissCount >= 1`): `dismissCount = 2`, `resolvedAt = now`
- Já resolvido: `ConflictException` (409)
- `EMPLOYEE`: `ForbiddenException` (403)

- [ ] **Step 1: Testes de dismiss (append no spec)**

```ts
describe('FeedbackService.dismiss', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let svc: FeedbackService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prisma = mockDeep<PrismaService>();
    svc = new FeedbackService(prisma, { get: () => undefined } as any, { sendSupportEmail: jest.fn() } as any);
  });
  afterEach(() => jest.useRealTimers());

  it('funcionário → 403', async () => {
    await expect(svc.dismiss(ctx({ role: UserRole.EMPLOYEE }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('primeiro dismiss cria snooze de 168h', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue(null);
    prisma.userFeedback.upsert.mockResolvedValue({} as any);
    const out = await svc.dismiss(ctx({ role: UserRole.NUTRITIONIST }));
    expect(out).toEqual({ ok: true });
    expect(prisma.userFeedback.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: {
        userId: 'u1',
        dismissCount: 1,
        snoozedUntil: new Date(NOW.getTime() + FEEDBACK_SNOOZE_MS),
      },
      update: {
        dismissCount: 1,
        snoozedUntil: new Date(NOW.getTime() + FEEDBACK_SNOOZE_MS),
      },
    });
  });

  it('segundo dismiss preenche resolvedAt', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue({
      id: 'f1',
      dismissCount: 1,
      resolvedAt: null,
    } as any);
    prisma.userFeedback.update.mockResolvedValue({} as any);
    await svc.dismiss(ctx({ role: UserRole.PATIENT }));
    expect(prisma.userFeedback.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { dismissCount: 2, resolvedAt: NOW },
    });
  });

  it('já resolvido → 409', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue({ resolvedAt: NOW, dismissCount: 2 } as any);
    await expect(svc.dismiss(ctx({ role: UserRole.NUTRITIONIST }))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/api test feedback.service`

Expected: FAIL (`not implemented` ou assertion no upsert)

- [ ] **Step 3: Implementar `dismiss`**

Substituir o stub:

```ts
  async dismiss(ctx: AuthContext): Promise<DismissFeedbackResponse> {
    const user = ctx.user!;
    if (user.role === UserRole.EMPLOYEE) throw new ForbiddenException();

    const row = await this.prisma.userFeedback.findUnique({ where: { userId: user.id } });
    if (row?.resolvedAt) throw new ConflictException('Feedback already resolved');

    const now = new Date();
    if (!row || row.dismissCount === 0) {
      await this.prisma.userFeedback.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          dismissCount: 1,
          snoozedUntil: new Date(now.getTime() + FEEDBACK_SNOOZE_MS),
        },
        update: {
          dismissCount: 1,
          snoozedUntil: new Date(now.getTime() + FEEDBACK_SNOOZE_MS),
        },
      });
      return { ok: true };
    }

    await this.prisma.userFeedback.update({
      where: { userId: user.id },
      data: { dismissCount: 2, resolvedAt: now },
    });
    return { ok: true };
  }
```

- [ ] **Step 4: Rodar os testes**

Run: `pnpm --filter @nutri-plus/api test feedback.service`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/feedback/feedback.service.ts apps/api/src/feedback/feedback.service.spec.ts
git commit -m "feat(api): dismiss feedback with 7-day snooze then lock"
```

---

### Task 4: E-mail + FeedbackService.submit

**Files:**
- Create: `apps/api/src/feedback/feedback-email.ts`
- Create: `apps/api/src/feedback/feedback-email.spec.ts`
- Modify: `apps/api/src/feedback/feedback.service.ts`
- Modify: `apps/api/src/feedback/feedback.service.spec.ts`

**Interfaces:**
- Produces: `buildFeedbackEmail(input): { subject: string; text: string }`
- Produces: `submit(ctx, dto): Promise<SubmitFeedbackResponse>`
- Ordem: e-mail primeiro; só então upsert de `rating`, `comment`, `source`, `resolvedAt`
- Comment `''` / só espaços → `null`
- Já resolvido → `ConflictException` **antes** do e-mail
- Sem `SUPPORT_INBOX_EMAIL` / `SUPPORT_FROM_EMAIL` → `ServiceUnavailableException` (503), sem persistir nota
- `sendSupportEmail` rejeita → propaga (502 do Resend), sem persistir nota
- Linha de dismiss anterior permanece intacta se o e-mail falhar

- [ ] **Step 1: Teste do builder de e-mail**

`apps/api/src/feedback/feedback-email.ts` ainda não existe. Spec:

```ts
import { buildFeedbackEmail } from './feedback-email';

describe('buildFeedbackEmail', () => {
  it('monta subject e corpo com comentário', () => {
    const out = buildFeedbackEmail({
      rating: 4,
      comment: 'Gostei do plano',
      source: 'WEB',
      user: { id: 'u1', name: 'Ana', email: 'ana@x.com', role: 'NUTRITIONIST' },
      sentAt: new Date('2026-08-14T12:00:00.000Z'),
    });
    expect(out.subject).toBe('[iNutri Feedback] 4/5 — Ana');
    expect(out.text).toContain('Nota: 4/5');
    expect(out.text).toContain('Comentário: Gostei do plano');
    expect(out.text).toContain('Origem: WEB');
    expect(out.text).toContain('Ana <ana@x.com>');
    expect(out.text).toContain('Role: NUTRITIONIST');
    expect(out.text).toContain('User ID: u1');
    expect(out.text).toContain('2026-08-14T12:00:00.000Z');
  });

  it('comentário nulo vira em-dash', () => {
    const out = buildFeedbackEmail({
      rating: 2,
      comment: null,
      source: 'MOBILE',
      user: { id: 'u2', name: 'Bia', email: 'bia@x.com', role: 'PATIENT' },
      sentAt: new Date('2026-08-14T12:00:00.000Z'),
    });
    expect(out.text).toContain('Comentário: —');
    expect(out.subject).toBe('[iNutri Feedback] 2/5 — Bia');
  });
});
```

- [ ] **Step 2: Rodar o spec do e-mail e ver falhar**

Run: `pnpm --filter @nutri-plus/api test feedback-email`

Expected: FAIL (`Cannot find module './feedback-email'`)

- [ ] **Step 3: Implementar o builder**

```ts
import type { FeedbackSource } from '@nutri-plus/shared-types';

export function buildFeedbackEmail(input: {
  rating: number;
  comment: string | null;
  source: FeedbackSource;
  user: { id: string; name: string; email: string; role: string };
  sentAt: Date;
}): { subject: string; text: string } {
  const subject = `[iNutri Feedback] ${input.rating}/5 — ${input.user.name}`;
  const text = [
    `Nota: ${input.rating}/5`,
    `Comentário: ${input.comment ?? '—'}`,
    `Origem: ${input.source}`,
    `Usuário: ${input.user.name} <${input.user.email}>`,
    `Role: ${input.user.role}`,
    `User ID: ${input.user.id}`,
    `Enviado em: ${input.sentAt.toISOString()}`,
  ].join('\n');
  return { subject, text };
}
```

- [ ] **Step 4: Rodar o spec do e-mail**

Run: `pnpm --filter @nutri-plus/api test feedback-email`

Expected: PASS

- [ ] **Step 5: Testes de `submit` (append em `feedback.service.spec.ts`)**

```ts
describe('FeedbackService.submit', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let resend: { sendSupportEmail: jest.Mock };
  let svc: FeedbackService;
  const env = {
    SUPPORT_INBOX_EMAIL: 'inbox@inutri.life',
    SUPPORT_FROM_EMAIL: 'iNutri Suporte <suporte@inutri.life>',
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prisma = mockDeep<PrismaService>();
    resend = { sendSupportEmail: jest.fn().mockResolvedValue(undefined) };
    svc = new FeedbackService(prisma, { get: (k: string) => env[k as keyof typeof env] } as any, resend as any);
    prisma.userFeedback.findUnique.mockResolvedValue(null);
    prisma.userFeedback.upsert.mockResolvedValue({} as any);
  });
  afterEach(() => jest.useRealTimers());

  it('envia e-mail e depois persiste rating + resolvedAt', async () => {
    const out = await svc.submit(ctx({ role: UserRole.NUTRITIONIST }), {
      rating: 5,
      comment: '  top  ',
    });
    expect(out).toEqual({ ok: true });
    expect(resend.sendSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'inbox@inutri.life',
        from: 'iNutri Suporte <suporte@inutri.life>',
        replyTo: 'a@x.com',
        subject: '[iNutri Feedback] 5/5 — Ana',
      }),
    );
    expect(prisma.userFeedback.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: {
        userId: 'u1',
        rating: 5,
        comment: 'top',
        source: 'WEB',
        resolvedAt: NOW,
      },
      update: {
        rating: 5,
        comment: 'top',
        source: 'WEB',
        resolvedAt: NOW,
      },
    });
    const emailOrder = resend.sendSupportEmail.mock.invocationCallOrder[0];
    const dbOrder = prisma.userFeedback.upsert.mock.invocationCallOrder[0];
    expect(emailOrder).toBeLessThan(dbOrder);
  });

  it('comment vazio vira null; paciente source=MOBILE', async () => {
    await svc.submit(ctx({ role: UserRole.PATIENT }), { rating: 2, comment: '   ' });
    expect(prisma.userFeedback.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ comment: null, source: 'MOBILE', rating: 2 }),
      }),
    );
  });

  it('já resolvido → 409 e não manda e-mail', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue({ resolvedAt: NOW } as any);
    await expect(
      svc.submit(ctx({ role: UserRole.NUTRITIONIST }), { rating: 4 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(resend.sendSupportEmail).not.toHaveBeenCalled();
    expect(prisma.userFeedback.upsert).not.toHaveBeenCalled();
  });

  it('env ausente → 503 e não persiste', async () => {
    svc = new FeedbackService(prisma, { get: () => undefined } as any, resend as any);
    await expect(
      svc.submit(ctx({ role: UserRole.NUTRITIONIST }), { rating: 4 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.userFeedback.upsert).not.toHaveBeenCalled();
  });

  it('Resend falha → propaga e não persiste (dismiss anterior intacto)', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue({
      id: 'f1',
      dismissCount: 1,
      resolvedAt: null,
    } as any);
    resend.sendSupportEmail.mockRejectedValue(new Error('resend down'));
    await expect(
      svc.submit(ctx({ role: UserRole.NUTRITIONIST }), { rating: 3 }),
    ).rejects.toThrow('resend down');
    expect(prisma.userFeedback.upsert).not.toHaveBeenCalled();
    expect(prisma.userFeedback.update).not.toHaveBeenCalled();
  });

  it('funcionário → 403', async () => {
    await expect(
      svc.submit(ctx({ role: UserRole.EMPLOYEE }), { rating: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

Importar `ServiceUnavailableException` no topo do spec.

- [ ] **Step 6: Rodar e ver submit falhar**

Run: `pnpm --filter @nutri-plus/api test feedback.service`

Expected: FAIL (`not implemented`)

- [ ] **Step 7: Implementar `submit`**

```ts
  async submit(ctx: AuthContext, dto: SubmitFeedbackRequest): Promise<SubmitFeedbackResponse> {
    const user = ctx.user!;
    if (user.role === UserRole.EMPLOYEE) throw new ForbiddenException();

    const row = await this.prisma.userFeedback.findUnique({ where: { userId: user.id } });
    if (row?.resolvedAt) throw new ConflictException('Feedback already resolved');

    const to = this.config.get<string>('SUPPORT_INBOX_EMAIL');
    const from = this.config.get<string>('SUPPORT_FROM_EMAIL');
    if (!to || !from) {
      throw new ServiceUnavailableException(
        'Envio de e-mail não configurado (SUPPORT_INBOX_EMAIL / SUPPORT_FROM_EMAIL)',
      );
    }

    const comment = dto.comment?.trim() ? dto.comment.trim() : null;
    const source = sourceFor(user.role);
    const now = new Date();
    const email = buildFeedbackEmail({
      rating: dto.rating,
      comment,
      source,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      sentAt: now,
    });

    await this.resend.sendSupportEmail({
      to,
      from,
      replyTo: user.email,
      subject: email.subject,
      text: email.text,
    });

    await this.prisma.userFeedback.upsert({
      where: { userId: user.id },
      create: { userId: user.id, rating: dto.rating, comment, source, resolvedAt: now },
      update: { rating: dto.rating, comment, source, resolvedAt: now },
    });
    return { ok: true };
  }
```

Importar `buildFeedbackEmail` de `./feedback-email`.

- [ ] **Step 8: Rodar os testes do service**

Run: `pnpm --filter @nutri-plus/api test feedback.service`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/feedback/feedback-email.ts apps/api/src/feedback/feedback-email.spec.ts apps/api/src/feedback/feedback.service.ts apps/api/src/feedback/feedback.service.spec.ts
git commit -m "feat(api): submit feedback with Resend email then persist"
```

---

### Task 5: HTTP — DTO, controller, module

**Files:**
- Create: `apps/api/src/feedback/dto/submit-feedback.dto.ts`
- Create: `apps/api/src/feedback/feedback.controller.ts`
- Create: `apps/api/src/feedback/feedback.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `FeedbackService.getPrompt` / `dismiss` / `submit` das Tasks 2–4
- Produces:
  - `GET /v1/feedback/prompt` — roles `NUTRITIONIST | PATIENT | EMPLOYEE`, `@BillingExempt()`
  - `POST /v1/feedback` — body `SubmitFeedbackDto`, roles `NUTRITIONIST | PATIENT` (EMPLOYEE = 403 do `RolesGuard`), 201
  - `POST /v1/feedback/dismiss` — sem body, mesmos roles do POST, `{ ok: true }`
- `SubmitFeedbackDto`: `@IsInt() @Min(1) @Max(5) rating`; `@IsOptional() @IsString() @MaxLength(2000) comment?`

Não criar spec de controller — o padrão do suporte é service-only; 400 de comment > 2000 e rating inválido vêm do `ValidationPipe` global (`whitelist`, `transform`, `forbidNonWhitelisted`).

- [ ] **Step 1: DTO**

```ts
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { FEEDBACK_COMMENT_MAX } from '@nutri-plus/shared-types';

export class SubmitFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(FEEDBACK_COMMENT_MAX)
  comment?: string;
}
```

- [ ] **Step 2: Controller**

```ts
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  DismissFeedbackResponse,
  FeedbackPromptResponse,
  SubmitFeedbackResponse,
} from '@nutri-plus/shared-types';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { BillingExempt } from '../billing/decorators';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('feedback')
@ApiBearerAuth()
@Controller({ path: 'feedback', version: '1' })
@Roles(UserRole.NUTRITIONIST, UserRole.PATIENT, UserRole.EMPLOYEE)
@BillingExempt()
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get('prompt')
  getPrompt(@CurrentUser() ctx: AuthContext): Promise<FeedbackPromptResponse> {
    return this.feedback.getPrompt(ctx);
  }

  @Post()
  @Roles(UserRole.NUTRITIONIST, UserRole.PATIENT)
  submit(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: SubmitFeedbackDto,
  ): Promise<SubmitFeedbackResponse> {
    return this.feedback.submit(ctx, { rating: dto.rating as 1 | 2 | 3 | 4 | 5, comment: dto.comment });
  }

  @Post('dismiss')
  @Roles(UserRole.NUTRITIONIST, UserRole.PATIENT)
  dismiss(@CurrentUser() ctx: AuthContext): Promise<DismissFeedbackResponse> {
    return this.feedback.dismiss(ctx);
  }
}
```

`RolesGuard` usa `getAllAndOverride` (handler ganha do class): POST sem NUTRITIONIST/PATIENT → 403.

- [ ] **Step 3: Module + AppModule**

```ts
import { Module } from '@nestjs/common';
import { SupportModule } from '../support/support.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [SupportModule],
  controllers: [FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
```

`SupportModule` já exporta `ResendService`. Em `app.module.ts`, adicionar `FeedbackModule` na lista `imports` (depois de `SupportModule`).

- [ ] **Step 4: AppModule ainda compila**

Run: `pnpm --filter @nutri-plus/api test app.module.spec`

Expected: PASS

- [ ] **Step 5: Suite do feedback intacta**

Run: `pnpm --filter @nutri-plus/api test feedback`

Expected: PASS (`feedback.service` + `feedback-email`)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/feedback/dto/submit-feedback.dto.ts apps/api/src/feedback/feedback.controller.ts apps/api/src/feedback/feedback.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): expose /v1/feedback prompt, submit and dismiss"
```

---

### Task 6: Dialog web do nutricionista

**Files:**
- Create: `apps/web/src/lib/api/feedback.ts`
- Create: `apps/web/src/lib/queries/feedback.ts`
- Create: `apps/web/src/components/feedback/feedback-dialog.tsx`
- Create: `apps/web/src/components/feedback/feedback-dialog.test.tsx`
- Create: `apps/web/src/components/feedback/feedback-prompt-host.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `GET /feedback/prompt`, `POST /feedback`, `POST /feedback/dismiss`
- Produces: `getFeedbackPrompt()`, `submitFeedback(body)`, `dismissFeedback()`
- Produces: `FeedbackDialog` (presentational) e `FeedbackPromptHost` (query + open)
- Host só monta a query quando `enabled === true` (role nutricionista)
- Dialog **depois** de `BillingGate` e `OnboardingGate`

- [ ] **Step 1: Client + query (sem teste próprio; o dialog cobre o fluxo)**

`apps/web/src/lib/api/feedback.ts`:

```ts
import type {
  DismissFeedbackResponse,
  FeedbackPromptResponse,
  SubmitFeedbackRequest,
  SubmitFeedbackResponse,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from './browser';

export function getFeedbackPrompt(): Promise<FeedbackPromptResponse> {
  return browserApiFetch<FeedbackPromptResponse>('/feedback/prompt');
}

export function submitFeedback(body: SubmitFeedbackRequest): Promise<SubmitFeedbackResponse> {
  return browserApiFetch<SubmitFeedbackResponse>('/feedback', { method: 'POST', body });
}

export function dismissFeedback(): Promise<DismissFeedbackResponse> {
  return browserApiFetch<DismissFeedbackResponse>('/feedback/dismiss', { method: 'POST' });
}
```

`apps/web/src/lib/queries/feedback.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { getFeedbackPrompt } from '@/lib/api/feedback';

export const FEEDBACK_PROMPT_KEY = ['feedback', 'prompt'] as const;

export function useFeedbackPrompt(enabled: boolean) {
  return useQuery({
    queryKey: FEEDBACK_PROMPT_KEY,
    queryFn: getFeedbackPrompt,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
```

- [ ] **Step 2: Teste do dialog**

`apps/web/src/components/feedback/feedback-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackDialog } from './feedback-dialog';

const onSubmit = vi.fn();
const onDismiss = vi.fn();

beforeEach(() => {
  onSubmit.mockReset().mockResolvedValue(undefined);
  onDismiss.mockReset().mockResolvedValue(undefined);
});

describe('FeedbackDialog', () => {
  it('não renderiza conteúdo quando open=false', () => {
    render(<FeedbackDialog open={false} onSubmit={onSubmit} onDismiss={onDismiss} pending={false} />);
    expect(screen.queryByText(/o que você está achando do inutri/i)).not.toBeInTheDocument();
  });

  it('Enviar fica desabilitado sem nota', async () => {
    render(<FeedbackDialog open onSubmit={onSubmit} onDismiss={onDismiss} pending={false} />);
    expect(screen.getByRole('button', { name: /^enviar$/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /^enviar$/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('escolhe nota e envia comment opcional', async () => {
    render(<FeedbackDialog open onSubmit={onSubmit} onDismiss={onDismiss} pending={false} />);
    await userEvent.click(screen.getByRole('button', { name: /nota 4/i }));
    await userEvent.type(screen.getByLabelText(/sugestão ou correção/i), 'Adicionar atalho');
    await userEvent.click(screen.getByRole('button', { name: /^enviar$/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ rating: 4, comment: 'Adicionar atalho' }),
    );
  });

  it('Agora não chama onDismiss', async () => {
    render(<FeedbackDialog open onSubmit={onSubmit} onDismiss={onDismiss} pending={false} />);
    await userEvent.click(screen.getByRole('button', { name: /agora não/i }));
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/web test feedback-dialog`

Expected: FAIL (`Cannot find module './feedback-dialog'`)

- [ ] **Step 4: Implementar o dialog**

Padrão visual do `SupportDialog` (`rounded-full`, shadcn `Dialog`). Estrelas: 5 botões `aria-label="Nota {n}"`. Lucide `Star`. Copy **exata**:

- Título: `O que você está achando do iNutri?`
- Texto: `Sua opinião nos ajuda a melhorar. Tem alguma sugestão ou encontrou algum problema?`
- Textarea label/placeholder: `Sugestão ou correção (opcional)`
- Botões: `Agora não` / `Enviar`

```tsx
'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import type { SubmitFeedbackRequest } from '@nutri-plus/shared-types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function FeedbackDialog({
  open,
  onSubmit,
  onDismiss,
  pending,
}: {
  open: boolean;
  onSubmit: (body: SubmitFeedbackRequest) => Promise<void>;
  onDismiss: () => void | Promise<void>;
  pending: boolean;
}) {
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [comment, setComment] = useState('');

  async function handleOpenChange(next: boolean) {
    if (!next) await onDismiss();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>O que você está achando do iNutri?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Sua opinião nos ajuda a melhorar. Tem alguma sugestão ou encontrou algum problema?
          </p>
        </DialogHeader>
        <div className="flex gap-1" role="group" aria-label="Nota de 1 a 5">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Nota ${n}`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              className="rounded-md p-1"
            >
              <Star className={rating !== null && n <= rating ? 'fill-current' : ''} />
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="feedback-comment">Sugestão ou correção (opcional)</Label>
          <Textarea
            id="feedback-comment"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        <DialogFooter className="justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onDismiss()} disabled={pending}>
            Agora não
          </Button>
          <Button
            type="button"
            className="rounded-full"
            disabled={pending || rating === null}
            onClick={() => rating && onSubmit({ rating, comment: comment.trim() || undefined })}
          >
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

O X / Esc passam por `onOpenChange(false)` → `onDismiss`.

- [ ] **Step 5: Rodar o teste do dialog**

Run: `pnpm --filter @nutri-plus/web test feedback-dialog`

Expected: PASS

- [ ] **Step 6: Host + layout**

`apps/web/src/components/feedback/feedback-prompt-host.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import { dismissFeedback, submitFeedback } from '@/lib/api/feedback';
import { useFeedbackPrompt } from '@/lib/queries/feedback';
import type { SubmitFeedbackRequest } from '@nutri-plus/shared-types';
import { FeedbackDialog } from './feedback-dialog';

export function FeedbackPromptHost({ enabled }: { enabled: boolean }) {
  const q = useFeedbackPrompt(enabled);
  const [closed, setClosed] = useState(false);
  const [pending, setPending] = useState(false);
  const dismissed = useRef(false);
  const open = enabled && !closed && q.data?.shouldShow === true;

  async function onSubmit(body: SubmitFeedbackRequest) {
    setPending(true);
    try {
      await submitFeedback(body);
      toast.success('Obrigado pelo seu feedback!');
      dismissed.current = true;
      setClosed(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        dismissed.current = true;
        setClosed(true);
        return;
      }
      toast.error('Não foi possível enviar. Tente novamente.');
    } finally {
      setPending(false);
    }
  }

  async function onDismiss() {
    if (dismissed.current) return;
    dismissed.current = true;
    setClosed(true);
    try {
      await dismissFeedback();
    } catch {
      // próximo GET corrige
    }
  }

  return <FeedbackDialog open={open} onSubmit={onSubmit} onDismiss={onDismiss} pending={pending} />;
}
```

GET em loading / erro / `shouldShow: false` → `open` é false → zero UI.

Em `apps/web/src/app/(app)/layout.tsx`:

- Importar `FeedbackPromptHost`.
- Dentro de `SidebarInset`, **depois** de `<OnboardingGate />`, adicionar:

```tsx
{me?.role === 'NUTRITIONIST' ? <FeedbackPromptHost enabled /> : null}
```

Não adicionar item no sidebar.

- [ ] **Step 7: Rodar testes do dialog de novo (regressão)**

Run: `pnpm --filter @nutri-plus/web test feedback-dialog`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/api/feedback.ts apps/web/src/lib/queries/feedback.ts apps/web/src/components/feedback apps/web/src/app/\(app\)/layout.tsx
git commit -m "feat(web): show nutritionist feedback dialog after 3 days"
```

---

### Task 7: App do paciente — store review + dialog

**Files:**
- Modify: `apps/mobile/package.json` (e lockfile) — adicionar `expo-store-review`
- Modify: `apps/mobile/app.config.js` — `extra.appleAppId = '6789184541'`
- Create: `apps/mobile/lib/store-review.ts`
- Create: `apps/mobile/lib/store-review.test.ts`
- Create: `apps/mobile/lib/queries/feedback.ts`
- Create: `apps/mobile/components/feedback/feedback-prompt.tsx`
- Create: `apps/mobile/components/feedback/feedback-prompt.test.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx`

**Interfaces:**
- Produces: `requestStoreReview(): Promise<void>` — `StoreReview.isAvailableAsync()` → `requestReview()`; senão iOS `https://apps.apple.com/br/app/inutri-pacientes/id6789184541`; Android `market://details?id=com.inutri.app` com fallback `https://play.google.com/store/apps/details?id=com.inutri.app`
- Produces: `FeedbackPrompt` — sempre chama GET (stamp `firstAppLoginAt`); dialog se `shouldShow`; 4–5 chama `requestStoreReview`; 1–3 só `Alert.alert` de obrigado
- Montar **depois** do `ConsentGate`, como irmão das `Tabs`

- [ ] **Step 1: Instalar `expo-store-review` e extra**

Run: `pnpm --filter @nutri-plus/mobile add expo-store-review`

Em `apps/mobile/app.config.js`, em `extra`, ao lado de `eas`:

```js
    appleAppId: '6789184541',
    androidPackage: 'com.inutri.app',
```

- [ ] **Step 2: Teste de `requestStoreReview`**

```ts
import { Platform, Linking } from 'react-native';

const isAvailableAsync = jest.fn();
const requestReview = jest.fn();
jest.mock('expo-store-review', () => ({
  isAvailableAsync: () => isAvailableAsync(),
  requestReview: () => requestReview(),
}));

import { requestStoreReview } from './store-review';

describe('requestStoreReview', () => {
  beforeEach(() => {
    isAvailableAsync.mockReset();
    requestReview.mockReset();
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
  });

  it('usa review nativo quando disponível', async () => {
    isAvailableAsync.mockResolvedValue(true);
    await requestStoreReview();
    expect(requestReview).toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('iOS cai na App Store quando nativo indisponível', async () => {
    isAvailableAsync.mockResolvedValue(false);
    Platform.OS = 'ios';
    await requestStoreReview();
    expect(requestReview).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://apps.apple.com/br/app/inutri-pacientes/id6789184541',
    );
  });

  it('Android tenta market: e cai no https se necessário', async () => {
    isAvailableAsync.mockResolvedValue(false);
    Platform.OS = 'android';
    (Linking.canOpenURL as jest.Mock).mockResolvedValueOnce(false);
    await requestStoreReview();
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://play.google.com/store/apps/details?id=com.inutri.app',
    );
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/mobile test store-review`

Expected: FAIL (`Cannot find module './store-review'`)

- [ ] **Step 4: Implementar `store-review.ts`**

```ts
import { Linking, Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';

const IOS_URL = 'https://apps.apple.com/br/app/inutri-pacientes/id6789184541';
const ANDROID_PACKAGE = 'com.inutri.app';
const ANDROID_MARKET = `market://details?id=${ANDROID_PACKAGE}`;
const ANDROID_WEB = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

export async function requestStoreReview(): Promise<void> {
  if (await StoreReview.isAvailableAsync()) {
    await StoreReview.requestReview();
    return;
  }
  if (Platform.OS === 'ios') {
    await Linking.openURL(IOS_URL);
    return;
  }
  const marketOk = await Linking.canOpenURL(ANDROID_MARKET);
  await Linking.openURL(marketOk ? ANDROID_MARKET : ANDROID_WEB);
}
```

`appleAppId` no `app.config.js` documenta o id da loja (mesmo `6789184541` da URL). O helper iOS usa a constante `IOS_URL` — a mesma do `download-app` — para o fallback ser estável nos testes sem mockar `expo-constants`. Remova o import de `expo-constants` se não for usado.

- [ ] **Step 5: Rodar store-review**

Run: `pnpm --filter @nutri-plus/mobile test store-review`

Expected: PASS

- [ ] **Step 6: Teste do `FeedbackPrompt`**

```tsx
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const requestStoreReview = jest.fn();
const submitFeedback = jest.fn();
const dismissFeedback = jest.fn();

jest.mock('../../lib/store-review', () => ({
  requestStoreReview: () => requestStoreReview(),
}));
jest.mock('../../lib/queries/feedback', () => ({
  useFeedbackPrompt: () => ({ data: { shouldShow: true, source: 'MOBILE' }, isLoading: false, isError: false }),
  useSubmitFeedback: () => ({ mutateAsync: submitFeedback, isPending: false }),
  useDismissFeedback: () => ({ mutateAsync: dismissFeedback }),
}));

import { FeedbackPrompt } from './feedback-prompt';

beforeEach(() => {
  requestStoreReview.mockReset();
  submitFeedback.mockReset().mockResolvedValue({ ok: true });
  dismissFeedback.mockReset().mockResolvedValue({ ok: true });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('FeedbackPrompt', () => {
  it('nota 5 envia e chama review da loja', async () => {
    render(<FeedbackPrompt />);
    fireEvent.press(screen.getByLabelText('Nota 5'));
    fireEvent.press(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith({ rating: 5, comment: undefined }));
    await waitFor(() => expect(requestStoreReview).toHaveBeenCalled());
  });

  it('nota 2 envia e não abre a loja', async () => {
    render(<FeedbackPrompt />);
    fireEvent.press(screen.getByLabelText('Nota 2'));
    fireEvent.press(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(submitFeedback).toHaveBeenCalled());
    expect(requestStoreReview).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('Agora não chama dismiss e não envia', async () => {
    render(<FeedbackPrompt />);
    fireEvent.press(screen.getByRole('button', { name: /agora não/i }));
    await waitFor(() => expect(dismissFeedback).toHaveBeenCalled());
    expect(submitFeedback).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/mobile test feedback-prompt`

Expected: FAIL (`Cannot find module './feedback-prompt'`)

- [ ] **Step 8: Queries + componente**

`apps/mobile/lib/queries/feedback.ts`:

```ts
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  DismissFeedbackResponse,
  FeedbackPromptResponse,
  SubmitFeedbackRequest,
  SubmitFeedbackResponse,
} from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function useFeedbackPrompt(enabled = true) {
  return useQuery({
    queryKey: ['feedback', 'prompt'],
    queryFn: () => apiFetch<FeedbackPromptResponse>('/feedback/prompt'),
    enabled,
    retry: false,
  });
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (body: SubmitFeedbackRequest) =>
      apiFetch<SubmitFeedbackResponse>('/feedback', { method: 'POST', body }),
  });
}

export function useDismissFeedback() {
  return useMutation({
    mutationFn: () => apiFetch<DismissFeedbackResponse>('/feedback/dismiss', { method: 'POST' }),
  });
}
```

`FeedbackPrompt`: `Modal` do React Native (não `Alert.alert` para o form). Copy:

- Título: `O que você está achando do iNutri?`
- Texto: `Sua opinião nos ajuda a melhorar o app.`
- Estrelas `accessibilityLabel={`Nota ${n}`}`
- `TextField` multiline label `Sugestão ou correção (opcional)`
- Botões `Agora não` / `Enviar` (`accessibilityRole="button"`)
- Sem nota, Enviar `disabled`
- `shouldShow !== true` → `return null` (o hook ainda roda — stamp)
- Submit 201 + rating ≥ 4 → `requestStoreReview()` (engolir erro do review)
- Submit 201 + rating ≤ 3 → `Alert.alert('Obrigado!', 'Sua opinião nos ajuda a melhorar o app.')`
- Fechar / Agora não → `dismissFeedback.mutateAsync()` em try/catch; esconde o modal mesmo se falhar

- [ ] **Step 9: Rodar o teste do prompt**

Run: `pnpm --filter @nutri-plus/mobile test feedback-prompt`

Expected: PASS

- [ ] **Step 10: Montar no layout**

Em `apps/mobile/app/(app)/_layout.tsx`, depois do bloco `if (consent.data?.needsConsent)`, o return das Tabs vira:

```tsx
  return (
    <>
      <FeedbackPrompt />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: tab.active,
          tabBarInactiveTintColor: tab.inactive,
          tabBarStyle: { backgroundColor: tab.background, borderTopColor: tab.border },
        }}
      >
        {/* screens existentes, sem mudança */}
      </Tabs>
    </>
  );
```

Importar `FeedbackPrompt`. O GET roda em todo paciente autenticado com consentimento aceito — é o que grava `firstAppLoginAt`.

- [ ] **Step 11: Suites mobile desta feature**

Run: `pnpm --filter @nutri-plus/mobile test store-review`  
Run: `pnpm --filter @nutri-plus/mobile test feedback-prompt`

Expected: PASS nos dois

- [ ] **Step 12: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/app.config.js apps/mobile/lib/store-review.ts apps/mobile/lib/store-review.test.ts apps/mobile/lib/queries/feedback.ts apps/mobile/components/feedback apps/mobile/app/\(app\)/_layout.tsx
git commit -m "feat(mobile): prompt store review after one week of real use"
```

---

## Self-review (spec coverage)

| Requisito da spec | Task |
|---|---|
| `UserFeedback` + `firstAppLoginAt` + types | 1 |
| GET prompt: 72h / 168h / stamp / employee / snooze / resolved | 2 |
| Dismiss 1 = snooze 168h; dismiss 2 = resolved; 409 | 3 |
| Submit + e-mail + ordem e-mail→DB + 502/503 sem resolvedAt | 4 |
| Comment vazio → null; source pelo role | 4 |
| Rotas, BillingExempt, POST employee 403, DTO 1–5 / 2000 | 5 |
| Dialog web, copy, estrelas, host depois dos gates | 6 |
| Sem item de menu | 6 (não adiciona) |
| Mobile GET sempre, dialog depois do consent | 7 |
| 4–5 nativo + fallback loja; 1–3 sem loja | 7 |
| URLs da loja + `appleAppId` | 7 |
| Sem backfill de pacientes antigos | 2 (stamp no primeiro GET) |
| Sem painel / várias rodadas / e-mail ao usuário | nenhuma task cria isso |
