# AI em Segundo Plano — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar a nutricionista da espera — gerar e ajustar plano com IA passa a rodar em segundo plano, com aviso ao concluir, retry manual e painel de processos na página do paciente.

**Architecture:** Uma tabela `AiJob` guarda estado e resultado dos dois fluxos. O handler grava o job, responde `202 { jobId }` e dispara `void runJob(id)` no próprio processo — o mesmo padrão fire-and-forget que a transcrição de consulta já usa. O front deixa de esperar a resposta: faz polling dos jobs ativos do paciente enquanto houver algum.

**Tech Stack:** NestJS 10, Prisma 7, Postgres (Supabase), Next.js App Router, React Query 5, Vitest (web), Jest (api).

**Spec:** `docs/superpowers/specs/2026-08-28-ai-background-jobs-design.md`

## Global Constraints

- Todo texto de UI em **pt-BR**.
- Endpoints sob `@Roles(UserRole.NUTRITIONIST)`; posse do paciente verificada como nos endpoints atuais (404 para não-dono, nunca 403).
- **Cota de IA** = `AIInteraction(success: true, tipos de IA, mês SP)` **+** `AiJob(PENDING | RUNNING, mês SP)`. Verificada **só na criação do job**, nunca dentro de `runJob`.
- Limiar de job travado: **10 minutos** desde `startedAt`.
- `AIInteraction` continua sendo gravado por chamada, inalterado.
- Testes: api com Jest (`pnpm --filter @nutri-plus/api test`), web com Vitest (`pnpm --filter @nutri-plus/web test`).
- Deploy: **API antes do web** — os dois POST mudam de `201` com corpo para `202 { jobId }`.

---

### Task 1: Padrão de refeições no prompt de geração

Independente do resto do plano. Hoje o prompt diz `'Otherwise return meals in chronological order'` — sem estrutura padrão, o modelo escolhe sozinho quantas refeições criar.

**Files:**
- Modify: `apps/api/src/ai/prompts/meal-plan.prompt.ts`
- Test: `apps/api/src/ai/prompts/meal-plan.prompt.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada — só muda o conteúdo de `MEAL_PLAN_SYSTEM_PROMPT`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao final de `meal-plan.prompt.spec.ts`:

```ts
describe('MEAL_PLAN_SYSTEM_PROMPT — padrão de refeições', () => {
  it('nomeia as quatro refeições padrão', () => {
    expect(MEAL_PLAN_SYSTEM_PROMPT).toContain('Café da manhã');
    expect(MEAL_PLAN_SYSTEM_PROMPT).toContain('Almoço');
    expect(MEAL_PLAN_SYSTEM_PROMPT).toContain('Lanche');
    expect(MEAL_PLAN_SYSTEM_PROMPT).toContain('Jantar');
  });

  it('trata o padrão como fallback, não como regra rígida', () => {
    expect(MEAL_PLAN_SYSTEM_PROMPT).toMatch(/default/i);
    // O padrão precisa ceder quando o contexto pedir outra coisa.
    expect(MEAL_PLAN_SYSTEM_PROMPT).toMatch(/depart from this default/i);
  });
});
```

Se o `import` de `MEAL_PLAN_SYSTEM_PROMPT` ainda não existir no spec, adicionar:

```ts
import { MEAL_PLAN_SYSTEM_PROMPT } from './meal-plan.prompt';
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @nutri-plus/api test -- --testPathPattern meal-plan.prompt`
Expected: FAIL — as strings ainda não estão no prompt.

- [ ] **Step 3: Trocar a frase de fallback**

Em `apps/api/src/ai/prompts/meal-plan.prompt.ts`, substituir a linha:

```ts
  'Otherwise return meals in chronological order, each with realistic foods and amounts.',
```

por:

```ts
  'Otherwise, default to the four meals most Brazilians actually have, in this',
  'order: "Café da manhã", "Almoço", "Lanche" and "Jantar". Only depart from this',
  'default when the context calls for it — when patientNotes, restrictions,',
  'medicalConditions, defaultInstructions or customInstructions ask for more or',
  'fewer meals, or when the daily targets cannot fit in four meals without',
  'unrealistic portion sizes. Always return meals in chronological order, each',
  'with realistic foods and amounts.',
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @nutri-plus/api test -- --testPathPattern meal-plan.prompt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/prompts/meal-plan.prompt.ts apps/api/src/ai/prompts/meal-plan.prompt.spec.ts
git commit -m "feat(ai): define café/almoço/lanche/jantar como padrão da geração

Sem estrutura padrão o modelo escolhia sozinho quantas refeições criar. O
padrão cede quando as notas, restrições ou instruções pedirem outra coisa, e
também quando a meta calórica não couber em quatro refeições sem porções
irreais."
```

---

### Task 2: Tabela AiJob

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration via CLI (nome `ai_jobs`)

**Interfaces:**
- Consumes: nada.
- Produces: modelo Prisma `AiJob` (acessor do client: `prisma.aiJob`), enums `AiJobType` e `AiJobStatus`. Campos: `id`, `nutritionistId`, `patientId`, `type`, `status`, `input` (Json), `result` (Json?), `error` (String?), `mealPlanId` (String?), `createdAt`, `startedAt?`, `finishedAt?`, `consumedAt?`.

- [ ] **Step 1: Adicionar enums e modelo ao schema**

Em `apps/api/prisma/schema.prisma`, junto dos outros enums:

```prisma
enum AiJobType {
  MEAL_PLAN_GENERATION
  MEAL_PLAN_ADJUSTMENT
}

enum AiJobStatus {
  PENDING
  RUNNING
  DONE
  FAILED
}
```

E o modelo:

```prisma
// Estado dos trabalhos de IA disparados em segundo plano. `result` guarda o
// rascunho do ajuste, que não persiste sozinho; `mealPlanId` guarda o plano que
// a geração criou. Cada tipo usa só o campo que corresponde ao seu destino.
model AiJob {
  id             String              @id @default(uuid())
  nutritionistId String
  nutritionist   NutritionistProfile @relation(fields: [nutritionistId], references: [id], onDelete: Cascade)
  patientId      String
  patient        PatientProfile      @relation(fields: [patientId], references: [id], onDelete: Cascade)

  type   AiJobType
  status AiJobStatus @default(PENDING)

  input  Json
  result Json?
  error  String?

  mealPlanId String?
  mealPlan   MealPlan? @relation(fields: [mealPlanId], references: [id], onDelete: SetNull)

  createdAt  DateTime  @default(now())
  startedAt  DateTime?
  finishedAt DateTime?
  // Só no ajuste: o rascunho já foi carregado (ou descartado) no editor, então a
  // faixa "Ajuste pronto" não reaparece a cada abertura do plano.
  consumedAt DateTime?

  @@index([patientId, createdAt])
  @@index([nutritionistId, status])
}
```

- [ ] **Step 2: Declarar as relações inversas**

No modelo `NutritionistProfile`, acrescentar à lista de relações:

```prisma
  aiJobs AiJob[]
```

No modelo `PatientProfile`:

```prisma
  aiJobs AiJob[]
```

No modelo `MealPlan`:

```prisma
  aiJobs AiJob[]
```

- [ ] **Step 3: Gerar a migration**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name ai_jobs`
Expected: cria `apps/api/prisma/migrations/<timestamp>_ai_jobs/migration.sql` e regenera o client.

- [ ] **Step 4: Conferir que o client tipou**

Run: `pnpm --filter @nutri-plus/api exec tsc -p tsconfig.json --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): tabela AiJob para trabalhos de IA em segundo plano"
```

---

### Task 3: Tipos compartilhados do AiJob

**Files:**
- Create: `packages/shared-types/src/v1/ai-job.ts`
- Modify: `packages/shared-types/src/v1/index.ts`
- Test: `packages/shared-types/src/v1/ai-job.spec.ts`

**Interfaces:**
- Consumes: `MealPlanDraft` de `./meal-plan`.
- Produces: `AiJobType`, `AiJobStatus`, `AiJobView`, `AiJobDetail`, `CreateAiJobResponse`, `AI_JOB_STUCK_AFTER_MS`, `isAiJobStuck(job, now)`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `packages/shared-types/src/v1/ai-job.spec.ts`:

```ts
import { isAiJobStuck, AI_JOB_STUCK_AFTER_MS } from './ai-job';

const now = new Date('2026-08-28T12:00:00.000Z');
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();

describe('isAiJobStuck', () => {
  it('considera travado o RUNNING acima do limiar', () => {
    expect(isAiJobStuck({ status: 'RUNNING', startedAt: minutesAgo(11) }, now)).toBe(true);
  });

  it('não considera travado o RUNNING recente', () => {
    expect(isAiJobStuck({ status: 'RUNNING', startedAt: minutesAgo(2) }, now)).toBe(false);
  });

  it('nunca considera travado quem não está RUNNING', () => {
    expect(isAiJobStuck({ status: 'PENDING', startedAt: null }, now)).toBe(false);
    expect(isAiJobStuck({ status: 'FAILED', startedAt: minutesAgo(60) }, now)).toBe(false);
    expect(isAiJobStuck({ status: 'DONE', startedAt: minutesAgo(60) }, now)).toBe(false);
  });

  it('RUNNING sem startedAt não é travado', () => {
    expect(isAiJobStuck({ status: 'RUNNING', startedAt: null }, now)).toBe(false);
  });

  it('o limiar é de 10 minutos', () => {
    expect(AI_JOB_STUCK_AFTER_MS).toBe(10 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @nutri-plus/shared-types test -- ai-job`
Expected: FAIL — módulo não existe. (Se o pacote não tiver script `test`, rodar via api: `pnpm --filter @nutri-plus/api test -- --testPathPattern ai-job`.)

- [ ] **Step 3: Criar o módulo de tipos**

Criar `packages/shared-types/src/v1/ai-job.ts`:

```ts
import type { MealPlanDraft } from './meal-plan';

export type AiJobType = 'MEAL_PLAN_GENERATION' | 'MEAL_PLAN_ADJUSTMENT';
export type AiJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

// Um deploy no meio do job o deixa RUNNING para sempre — a API não tem varredura
// corrigindo status. Quem lê decide, com este limiar.
export const AI_JOB_STUCK_AFTER_MS = 10 * 60 * 1000;

export function isAiJobStuck(
  job: { status: AiJobStatus; startedAt: string | null },
  now: Date,
): boolean {
  if (job.status !== 'RUNNING' || job.startedAt === null) return false;
  return now.getTime() - new Date(job.startedAt).getTime() > AI_JOB_STUCK_AFTER_MS;
}

export interface AiJobView {
  id: string;
  type: AiJobType;
  status: AiJobStatus;
  patientId: string;
  mealPlanId: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  // Derivado no servidor com isAiJobStuck, para o front não repetir a regra.
  isStuck: boolean;
}

export interface AiJobDetail extends AiJobView {
  // Só no ajuste; null na geração, que entrega via mealPlanId.
  result: MealPlanDraft | null;
  consumedAt: string | null;
}

export interface CreateAiJobResponse {
  jobId: string;
}
```

- [ ] **Step 4: Exportar no barrel**

Em `packages/shared-types/src/v1/index.ts`, acrescentar na ordem alfabética:

```ts
export * from './ai-job';
```

- [ ] **Step 5: Rodar teste e build**

Run: `pnpm --filter @nutri-plus/shared-types test -- ai-job && pnpm --filter @nutri-plus/shared-types build`
Expected: PASS e build limpo.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/v1/ai-job.ts packages/shared-types/src/v1/ai-job.spec.ts packages/shared-types/src/v1/index.ts
git commit -m "feat(types): tipos e regra de job travado do AiJob"
```

---

### Task 4: Cota conta os jobs em voo

Hoje `countUsage` só conta `AIInteraction` bem-sucedidas. Como a checagem corre no momento da chamada, seria possível enfileirar dezenas de jobs e só descobrir o estouro um a um.

**Files:**
- Modify: `apps/api/src/billing/entitlements.service.ts`
- Test: `apps/api/src/billing/entitlements.service.spec.ts` (criar se não existir)

**Interfaces:**
- Consumes: `prisma.aiJob` (Task 2).
- Produces: `assertAiActionQuota(nutritionistId)` passa a somar jobs ativos; `getEntitlements` reflete o mesmo `aiUsed`.

- [ ] **Step 1: Escrever o teste que falha**

Criar (ou acrescentar a) `apps/api/src/billing/entitlements.service.spec.ts`:

```ts
import { EntitlementsService } from './entitlements.service';
import { PaymentRequiredException } from './payment-required.exception';

function svc(interactionCount: number, activeJobCount: number) {
  const prisma = {
    subscription: {
      findUnique: jest.fn().mockResolvedValue({
        status: 'ACTIVE', plan: 'ESSENCIAL', isComp: false, trialEndsAt: null,
      }),
    },
    aIInteraction: { count: jest.fn().mockResolvedValue(interactionCount) },
    aiJob: { count: jest.fn().mockResolvedValue(activeJobCount) },
    employeeProfile: { count: jest.fn().mockResolvedValue(0) },
  };
  return { service: new EntitlementsService(prisma as never), prisma };
}

describe('EntitlementsService.assertAiActionQuota', () => {
  // ESSENCIAL = 30 ações/mês.
  it('soma jobs ativos às interações bem-sucedidas', async () => {
    const { service } = svc(28, 2);
    await expect(service.assertAiActionQuota('n1')).rejects.toThrow(PaymentRequiredException);
  });

  it('passa quando a soma ainda cabe na cota', async () => {
    const { service } = svc(28, 1);
    await expect(service.assertAiActionQuota('n1')).resolves.toBeUndefined();
  });

  it('conta só PENDING e RUNNING, dentro do mês', async () => {
    const { service, prisma } = svc(0, 0);
    await service.assertAiActionQuota('n1');
    const where = prisma.aiJob.count.mock.calls[0][0].where;
    expect(where.nutritionistId).toBe('n1');
    expect(where.status).toEqual({ in: ['PENDING', 'RUNNING'] });
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @nutri-plus/api test -- --testPathPattern entitlements.service`
Expected: FAIL — o serviço ainda não consulta `aiJob`.

- [ ] **Step 3: Somar os jobs ativos**

Em `apps/api/src/billing/entitlements.service.ts`, acrescentar o método privado ao lado de `countUsage`:

```ts
  // Jobs de IA ainda em voo contam contra a cota. Sem isto, enfileirar dezenas
  // de gerações passaria pela checagem e só estouraria uma a uma, já que a cota
  // é derivada de AIInteraction bem-sucedidas — não há contador a debitar.
  private countActiveJobs(nutritionistId: string): Promise<number> {
    return this.prisma.aiJob.count({
      where: {
        nutritionistId,
        status: { in: ['PENDING', 'RUNNING'] },
        createdAt: { gte: saoPauloMonthStart(new Date()) },
      },
    });
  }

  private async countAiActions(nutritionistId: string): Promise<number> {
    const [done, active] = await Promise.all([
      this.countUsage(nutritionistId, AI_ACTION_TYPES),
      this.countActiveJobs(nutritionistId),
    ]);
    return done + active;
  }
```

Trocar as duas leituras de cota de IA para usar o novo método:

```ts
  async getEntitlements(nutritionistId: string): Promise<Entitlements> {
    const access = await this.resolveAccess(nutritionistId);
    const aiUsed = await this.countAiActions(nutritionistId);
    return { ...entitlementsForTier(access.tier, aiUsed), isReadOnly: access.isReadOnly };
  }

  async assertAiActionQuota(nutritionistId: string): Promise<void> {
    const { tier } = await this.resolveAccess(nutritionistId);
    const used = await this.countAiActions(nutritionistId);
    if (used >= PLAN_CATALOG[tier].aiActionsPerMonth) {
      throw new PaymentRequiredException('AI_QUOTA_EXCEEDED');
    }
  }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @nutri-plus/api test -- --testPathPattern billing`
Expected: PASS, incluindo as suítes de billing que já existiam.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/billing/entitlements.service.ts apps/api/src/billing/entitlements.service.spec.ts
git commit -m "feat(billing): jobs de IA em voo contam contra a cota mensal

A cota é derivada de AIInteraction bem-sucedidas, não um contador debitável.
Somar PENDING/RUNNING fecha o buraco de enfileirar e dispensa estorno: job que
falha sai do conjunto ativo sozinho."
```

---

### Task 5: AiJobsService — criar, executar e repetir

**Files:**
- Create: `apps/api/src/ai-jobs/ai-jobs.service.ts`
- Create: `apps/api/src/ai-jobs/ai-jobs.module.ts`
- Test: `apps/api/src/ai-jobs/ai-jobs.service.spec.ts`
- Modify: `apps/api/src/meal-generation/meal-generation.service.ts` (remover o assert de cota de `generate` e `adjust`)

**Interfaces:**
- Consumes: `EntitlementsService.assertAiActionQuota` (Task 4); `MealGenerationService.generate(ctx, patientId, instructions?)` e `.adjust(ctx, planId, instructions)`; `isAiJobStuck` (Task 3).
- Produces:
  - `AiJobsService.create(ctx, args: { type: AiJobType; patientId: string; planId?: string; instructions?: string }): Promise<{ jobId: string }>`
  - `AiJobsService.createForPlan(ctx, planId: string, instructions: string): Promise<{ jobId: string }>`
  - `AiJobsService.runJob(jobId: string): Promise<void>`
  - `AiJobsService.get(ctx, jobId: string): Promise<AiJobDetail>`
  - `AiJobsService.listForPatient(ctx, patientId: string): Promise<AiJobView[]>`
  - `AiJobsService.retry(ctx, jobId: string): Promise<{ jobId: string }>`
  - `AiJobsService.markConsumed(ctx, jobId: string): Promise<void>`

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/src/ai-jobs/ai-jobs.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AiJobsService } from './ai-jobs.service';

const ctx = { userId: 'u1', nutritionistId: 'n1', role: 'NUTRITIONIST' } as never;

function deps(job?: Record<string, unknown>) {
  const prisma = {
    aiJob: {
      create: jest.fn().mockResolvedValue({ id: 'j1' }),
      findFirst: jest.fn().mockResolvedValue(job ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    patientProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
    mealPlan: { findFirst: jest.fn().mockResolvedValue({ id: 'm1', patientId: 'p1' }) },
  };
  const entitlements = { assertAiActionQuota: jest.fn().mockResolvedValue(undefined) };
  const generation = {
    generate: jest.fn().mockResolvedValue({ id: 'plan1' }),
    adjust: jest.fn().mockResolvedValue({ title: 'rascunho' }),
  };
  const svc = new AiJobsService(prisma as never, entitlements as never, generation as never);
  return { svc, prisma, entitlements, generation };
}

describe('AiJobsService.create', () => {
  it('verifica a cota antes de gravar o job', async () => {
    const { svc, entitlements, prisma } = deps();
    await svc.create(ctx, { type: 'MEAL_PLAN_GENERATION', patientId: 'p1' });
    expect(entitlements.assertAiActionQuota).toHaveBeenCalledWith('n1');
    expect(prisma.aiJob.create).toHaveBeenCalled();
  });

  it('não grava job quando a cota estourou', async () => {
    const { svc, entitlements, prisma } = deps();
    entitlements.assertAiActionQuota.mockRejectedValue(new Error('AI_QUOTA_EXCEEDED'));
    await expect(svc.create(ctx, { type: 'MEAL_PLAN_GENERATION', patientId: 'p1' })).rejects.toThrow();
    expect(prisma.aiJob.create).not.toHaveBeenCalled();
  });
});

describe('AiJobsService.runJob', () => {
  it('geração grava DONE com mealPlanId', async () => {
    const { svc, prisma, generation } = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'PENDING',
      nutritionistId: 'n1', patientId: 'p1', input: {},
    });
    await svc.runJob('j1');
    expect(generation.generate).toHaveBeenCalled();
    const last = prisma.aiJob.update.mock.calls.at(-1)![0];
    expect(last.data).toMatchObject({ status: 'DONE', mealPlanId: 'plan1' });
  });

  it('ajuste grava DONE com o rascunho em result', async () => {
    const { svc, prisma, generation } = deps({
      id: 'j1', type: 'MEAL_PLAN_ADJUSTMENT', status: 'PENDING',
      nutritionistId: 'n1', patientId: 'p1', input: { planId: 'm1', instructions: 'menos carbo' },
    });
    await svc.runJob('j1');
    expect(generation.adjust).toHaveBeenCalledWith(expect.anything(), 'm1', 'menos carbo');
    const last = prisma.aiJob.update.mock.calls.at(-1)![0];
    expect(last.data).toMatchObject({ status: 'DONE' });
    expect(last.data.result).toEqual({ title: 'rascunho' });
  });

  it('falha grava FAILED com a mensagem', async () => {
    const { svc, prisma, generation } = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'PENDING',
      nutritionistId: 'n1', patientId: 'p1', input: {},
    });
    generation.generate.mockRejectedValue(new Error('AI provider unavailable'));
    await svc.runJob('j1');
    const last = prisma.aiJob.update.mock.calls.at(-1)![0];
    expect(last.data.status).toBe('FAILED');
    expect(last.data.error).toContain('AI provider unavailable');
  });
});

describe('AiJobsService.retry', () => {
  it('aceita job FAILED e volta para PENDING', async () => {
    const { svc, prisma } = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'FAILED',
      nutritionistId: 'n1', patientId: 'p1', input: {}, startedAt: new Date(),
    });
    await svc.retry(ctx, 'j1');
    expect(prisma.aiJob.update.mock.calls[0][0].data).toMatchObject({
      status: 'PENDING', error: null, startedAt: null, finishedAt: null,
    });
  });

  it('recusa job DONE', async () => {
    const { svc } = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'DONE',
      nutritionistId: 'n1', patientId: 'p1', input: {},
    });
    await expect(svc.retry(ctx, 'j1')).rejects.toThrow(ConflictException);
  });

  it('recusa RUNNING recente e aceita RUNNING travado', async () => {
    const recent = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'RUNNING',
      nutritionistId: 'n1', patientId: 'p1', input: {}, startedAt: new Date(),
    });
    await expect(recent.svc.retry(ctx, 'j1')).rejects.toThrow(ConflictException);

    const stuck = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'RUNNING',
      nutritionistId: 'n1', patientId: 'p1', input: {},
      startedAt: new Date(Date.now() - 11 * 60_000),
    });
    await expect(stuck.svc.retry(ctx, 'j1')).resolves.toEqual({ jobId: 'j1' });
  });

  it('job de outro nutricionista responde 404', async () => {
    const { svc } = deps();
    await expect(svc.retry(ctx, 'j1')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @nutri-plus/api test -- --testPathPattern ai-jobs.service`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o serviço**

Criar `apps/api/src/ai-jobs/ai-jobs.service.ts`:

```ts
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { isAiJobStuck, type AiJobDetail, type AiJobType, type AiJobView } from '@nutri-plus/shared-types';
import type { MealPlanDraft } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { MealGenerationService } from '../meal-generation/meal-generation.service';
import type { AuthContext } from '../auth/types/auth-context';

interface JobInput {
  planId?: string;
  instructions?: string;
}

// O runner precisa de um AuthContext para reusar as checagens de posse dos
// serviços existentes. O job guarda o nutricionista dono; reconstruímos a partir
// dele em vez de serializar o contexto inteiro no banco.
function contextFor(nutritionistId: string): AuthContext {
  return { userId: nutritionistId, nutritionistId, role: 'NUTRITIONIST' } as AuthContext;
}

@Injectable()
export class AiJobsService {
  private readonly logger = new Logger(AiJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly generation: MealGenerationService,
  ) {}

  // O ajuste chega com planId, mas o painel filtra por paciente — derivamos o
  // dono aqui em vez de deixar patientId opcional no modelo.
  async createForPlan(
    ctx: AuthContext,
    planId: string,
    instructions: string,
  ): Promise<{ jobId: string }> {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id: planId, patient: { nutritionistId: ctx.nutritionistId! } },
      select: { patientId: true },
    });
    if (!plan) throw new NotFoundException('Plano não encontrado.');
    return this.create(ctx, {
      type: 'MEAL_PLAN_ADJUSTMENT',
      patientId: plan.patientId,
      planId,
      instructions,
    });
  }

  async create(
    ctx: AuthContext,
    args: { type: AiJobType; patientId: string; planId?: string; instructions?: string },
  ): Promise<{ jobId: string }> {
    const nutritionistId = ctx.nutritionistId!;
    // Antes de gravar: um job PENDING já conta contra a cota (Task 4), então
    // verificar aqui é o que impede enfileirar acima do teto.
    await this.entitlements.assertAiActionQuota(nutritionistId);

    const input: JobInput = { planId: args.planId, instructions: args.instructions };
    const job = await this.prisma.aiJob.create({
      data: {
        nutritionistId,
        patientId: args.patientId,
        type: args.type,
        input: input as object,
      },
      select: { id: true },
    });

    void this.runJob(job.id);
    return { jobId: job.id };
  }

  // Fire-and-forget: nunca lança. Todo erro vira status FAILED no banco, que é
  // o que o painel do paciente lê.
  async runJob(jobId: string): Promise<void> {
    const job = await this.prisma.aiJob.findFirst({ where: { id: jobId } });
    if (!job || job.status === 'RUNNING' || job.status === 'DONE') return;

    await this.prisma.aiJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date(), error: null },
    });

    const input = (job.input ?? {}) as JobInput;
    const ctx = contextFor(job.nutritionistId);

    try {
      if (job.type === 'MEAL_PLAN_GENERATION') {
        const plan = await this.generation.generate(ctx, job.patientId, input.instructions);
        await this.prisma.aiJob.update({
          where: { id: jobId },
          data: { status: 'DONE', mealPlanId: plan.id, finishedAt: new Date() },
        });
      } else {
        const draft = await this.generation.adjust(ctx, input.planId!, input.instructions ?? '');
        await this.prisma.aiJob.update({
          where: { id: jobId },
          data: { status: 'DONE', result: draft as object, finishedAt: new Date() },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha inesperada';
      await this.prisma.aiJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: message.slice(0, 500), finishedAt: new Date() },
      });
      this.logger.warn(`AiJob ${jobId} falhou (type=${job.type})`);
    }
  }

  async get(ctx: AuthContext, jobId: string): Promise<AiJobDetail> {
    const job = await this.requireOwned(ctx, jobId);
    return { ...this.toView(job), result: (job.result as MealPlanDraft | null) ?? null, consumedAt: job.consumedAt?.toISOString() ?? null };
  }

  async listForPatient(ctx: AuthContext, patientId: string): Promise<AiJobView[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const jobs = await this.prisma.aiJob.findMany({
      where: {
        nutritionistId: ctx.nutritionistId!,
        patientId,
        OR: [
          { status: { in: ['PENDING', 'RUNNING'] } },
          { status: 'FAILED', createdAt: { gte: since } },
          // Ajuste concluído e ainda não revisado: é o que alimenta a faixa
          // "Ajuste pronto" no editor (Task 10).
          { status: 'DONE', type: 'MEAL_PLAN_ADJUSTMENT', consumedAt: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    return jobs.map((j) => this.toView(j));
  }

  async retry(ctx: AuthContext, jobId: string): Promise<{ jobId: string }> {
    const job = await this.requireOwned(ctx, jobId);
    const stuck = isAiJobStuck(
      { status: job.status, startedAt: job.startedAt?.toISOString() ?? null },
      new Date(),
    );
    if (job.status !== 'FAILED' && !stuck) {
      throw new ConflictException('Este trabalho não pode ser repetido agora.');
    }

    await this.prisma.aiJob.update({
      where: { id: jobId },
      data: { status: 'PENDING', error: null, startedAt: null, finishedAt: null },
    });
    void this.runJob(jobId);
    return { jobId };
  }

  async markConsumed(ctx: AuthContext, jobId: string): Promise<void> {
    await this.requireOwned(ctx, jobId);
    await this.prisma.aiJob.update({ where: { id: jobId }, data: { consumedAt: new Date() } });
  }

  private async requireOwned(ctx: AuthContext, jobId: string) {
    const job = await this.prisma.aiJob.findFirst({
      where: { id: jobId, nutritionistId: ctx.nutritionistId! },
    });
    // 404 e não 403: não revelamos a existência de job de outro nutricionista.
    if (!job) throw new NotFoundException('Trabalho não encontrado.');
    return job;
  }

  private toView(job: {
    id: string; type: string; status: string; patientId: string;
    mealPlanId: string | null; error: string | null;
    createdAt: Date; startedAt: Date | null; finishedAt: Date | null;
  }): AiJobView {
    const startedAt = job.startedAt?.toISOString() ?? null;
    const status = job.status as AiJobView['status'];
    return {
      id: job.id,
      type: job.type as AiJobType,
      status,
      patientId: job.patientId,
      mealPlanId: job.mealPlanId,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      startedAt,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      isStuck: isAiJobStuck({ status, startedAt }, new Date()),
    };
  }
}
```

- [ ] **Step 4: Tirar o assert de cota de dentro da geração**

Em `apps/api/src/meal-generation/meal-generation.service.ts`, remover as duas chamadas:

```ts
    await this.entitlements.assertAiActionQuota(nutritionistId);
```

uma em `generate` e uma em `adjust`, trocando cada uma pelo comentário:

```ts
    // A cota é verificada na criação do AiJob (AiJobsService.create). Repetir
    // aqui rejeitaria o próprio job, que já conta como ativo.
```

Se `entitlements` ficar sem uso no arquivo, remover o campo do construtor e o import.

- [ ] **Step 5: Criar o módulo**

Criar `apps/api/src/ai-jobs/ai-jobs.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MealGenerationModule } from '../meal-generation/meal-generation.module';
import { AiJobsService } from './ai-jobs.service';

@Module({
  imports: [BillingModule, MealGenerationModule],
  providers: [AiJobsService],
  exports: [AiJobsService],
})
export class AiJobsModule {}
```

Em `apps/api/src/meal-generation/meal-generation.module.ts`, acrescentar `MealGenerationService` aos `exports`:

```ts
  exports: [MealGenerationService],
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `pnpm --filter @nutri-plus/api test -- --testPathPattern "ai-jobs|meal-generation|billing"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/ai-jobs apps/api/src/meal-generation
git commit -m "feat(api): AiJobsService com execução em segundo plano e retry

Fire-and-forget no processo, como a transcrição já faz. runJob nunca lança:
erro vira status FAILED, que é o que o painel lê. A cota sai de generate/adjust
e passa a ser verificada na criação do job — repetir lá rejeitaria o próprio
job, que já conta como ativo."
```

---

### Task 6: Endpoints de job

**Files:**
- Modify: `apps/api/src/meal-generation/meal-generation.controller.ts`
- Create: `apps/api/src/ai-jobs/ai-jobs.controller.ts`
- Create: `apps/api/src/ai-jobs/dto/list-ai-jobs.dto.ts`
- Modify: `apps/api/src/ai-jobs/ai-jobs.module.ts` (registrar o controller)
- Modify: `apps/api/src/app.module.ts` (importar `AiJobsModule`)
- Test: `apps/api/src/ai-jobs/ai-jobs.controller.spec.ts`

**Interfaces:**
- Consumes: `AiJobsService` (Task 5).
- Produces: `POST /v1/ai/generate-meal-plan` e `POST /v1/ai/adjust-meal-plan` → `202 { jobId }`; `GET /v1/ai/jobs/:id`; `GET /v1/ai/jobs?patientId=`; `POST /v1/ai/jobs/:id/retry`; `POST /v1/ai/jobs/:id/consume`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/src/ai-jobs/ai-jobs.controller.spec.ts`:

```ts
import { AiJobsController } from './ai-jobs.controller';

const ctx = { userId: 'u1', nutritionistId: 'n1', role: 'NUTRITIONIST' } as never;

function deps() {
  const jobs = {
    get: jest.fn().mockResolvedValue({ id: 'j1', status: 'DONE' }),
    listForPatient: jest.fn().mockResolvedValue([]),
    retry: jest.fn().mockResolvedValue({ jobId: 'j1' }),
    markConsumed: jest.fn().mockResolvedValue(undefined),
  };
  return { ctrl: new AiJobsController(jobs as never), jobs };
}

describe('AiJobsController', () => {
  it('lista por paciente', async () => {
    const { ctrl, jobs } = deps();
    await ctrl.list(ctx, { patientId: 'p1' });
    expect(jobs.listForPatient).toHaveBeenCalledWith(ctx, 'p1');
  });

  it('busca um job', async () => {
    const { ctrl, jobs } = deps();
    await ctrl.get(ctx, 'j1');
    expect(jobs.get).toHaveBeenCalledWith(ctx, 'j1');
  });

  it('repete um job', async () => {
    const { ctrl, jobs } = deps();
    expect(await ctrl.retry(ctx, 'j1')).toEqual({ jobId: 'j1' });
    expect(jobs.retry).toHaveBeenCalledWith(ctx, 'j1');
  });

  it('marca o rascunho como consumido', async () => {
    const { ctrl, jobs } = deps();
    await ctrl.consume(ctx, 'j1');
    expect(jobs.markConsumed).toHaveBeenCalledWith(ctx, 'j1');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @nutri-plus/api test -- --testPathPattern ai-jobs.controller`
Expected: FAIL — controller não existe.

- [ ] **Step 3: Criar o DTO de listagem**

Criar `apps/api/src/ai-jobs/dto/list-ai-jobs.dto.ts`:

```ts
import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ListAiJobsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId!: string;
}
```

- [ ] **Step 4: Criar o controller**

Criar `apps/api/src/ai-jobs/ai-jobs.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthContext } from '../auth/types/auth-context';
import { AiJobsService } from './ai-jobs.service';
import { ListAiJobsDto } from './dto/list-ai-jobs.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Controller({ path: 'ai/jobs', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class AiJobsController {
  constructor(private readonly jobs: AiJobsService) {}

  @Get()
  list(@CurrentUser() ctx: AuthContext, @Query() query: ListAiJobsDto) {
    return this.jobs.listForPatient(ctx, query.patientId);
  }

  @Get(':id')
  get(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.get(ctx, id);
  }

  @Post(':id/retry')
  @HttpCode(202)
  retry(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.retry(ctx, id);
  }

  @Post(':id/consume')
  @HttpCode(204)
  consume(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.markConsumed(ctx, id);
  }
}
```

Nota: o parâmetro `@Body()` não é usado aqui; remover o import de `Body` se o lint reclamar.

- [ ] **Step 5: Trocar os dois POST existentes para 202**

Em `apps/api/src/meal-generation/meal-generation.controller.ts`, trocar o corpo da classe por:

```ts
export class MealGenerationController {
  constructor(private readonly jobs: AiJobsService) {}

  // 202: o trabalho roda em segundo plano; o cliente acompanha por GET /ai/jobs/:id.
  @Post('generate-meal-plan')
  @HttpCode(202)
  generateMealPlan(@CurrentUser() ctx: AuthContext, @Body() dto: GenerateMealPlanDto) {
    return this.jobs.create(ctx, {
      type: 'MEAL_PLAN_GENERATION',
      patientId: dto.patientId,
      instructions: dto.instructions,
    });
  }

  @Post('adjust-meal-plan')
  @HttpCode(202)
  async adjustMealPlan(@CurrentUser() ctx: AuthContext, @Body() dto: AdjustMealPlanDto) {
    return this.jobs.createForPlan(ctx, dto.planId, dto.instructions);
  }
}
```

Ajustar os imports: trocar `MealGenerationService` por `AiJobsService`, e acrescentar `HttpCode` a `@nestjs/common`.

- [ ] **Step 6: Registrar controller e módulo**

Em `apps/api/src/ai-jobs/ai-jobs.module.ts`, acrescentar:

```ts
  controllers: [AiJobsController],
```

Em `apps/api/src/meal-generation/meal-generation.module.ts`, importar `AiJobsModule` — mas isso criaria ciclo (`AiJobsModule` já importa `MealGenerationModule`). Em vez disso, **mover o `MealGenerationController` para o `AiJobsModule`**: remover `controllers: [MealGenerationController]` de `meal-generation.module.ts` e declarar em `ai-jobs.module.ts`:

```ts
  controllers: [AiJobsController, MealGenerationController],
```

Em `apps/api/src/app.module.ts`, acrescentar `AiJobsModule` à lista de `imports`.

- [ ] **Step 7: Rodar tudo**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc -p tsconfig.json --noEmit`
Expected: PASS e typecheck limpo.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): endpoints de AiJob e POST de IA passam a responder 202

generate e adjust deixam de bloquear: devolvem jobId e o cliente acompanha por
GET /ai/jobs/:id. O MealGenerationController muda de módulo para evitar ciclo
entre AiJobsModule e MealGenerationModule."
```

---

### Task 7: Cliente HTTP e hooks de job no web

**Files:**
- Create: `apps/web/src/lib/api/ai-jobs.ts`
- Create: `apps/web/src/lib/queries/ai-jobs.ts`
- Modify: `apps/web/src/lib/api/meal-plans.ts` (assinaturas de generate/adjust)
- Test: `apps/web/src/lib/api/ai-jobs.test.ts`

**Interfaces:**
- Consumes: tipos da Task 3; endpoints da Task 6.
- Produces:
  - `listAiJobs(patientId): Promise<AiJobView[]>`, `getAiJob(id): Promise<AiJobDetail>`, `retryAiJob(id): Promise<CreateAiJobResponse>`, `consumeAiJob(id): Promise<void>`
  - `useAiJobs(patientId)` — polling de 2 s enquanto houver job ativo
  - `useRetryAiJob(patientId)`, `useAiJob(id, enabled)`
  - `generateMealPlan(patientId, instructions?): Promise<CreateAiJobResponse>` e `adjustMealPlan(planId, instructions): Promise<CreateAiJobResponse>`

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/lib/api/ai-jobs.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...a: unknown[]) => browserApiFetch(...a),
  browserApiDownload: vi.fn(),
}));

import { listAiJobs, getAiJob, retryAiJob, consumeAiJob } from './ai-jobs';

beforeEach(() => browserApiFetch.mockReset().mockResolvedValue([]));

describe('ai-jobs api', () => {
  it('lista por paciente', async () => {
    await listAiJobs('p1');
    expect(browserApiFetch).toHaveBeenCalledWith('/ai/jobs?patientId=p1');
  });

  it('busca um job', async () => {
    await getAiJob('j1');
    expect(browserApiFetch).toHaveBeenCalledWith('/ai/jobs/j1');
  });

  it('repete um job', async () => {
    await retryAiJob('j1');
    expect(browserApiFetch).toHaveBeenCalledWith('/ai/jobs/j1/retry', { method: 'POST' });
  });

  it('marca como consumido', async () => {
    await consumeAiJob('j1');
    expect(browserApiFetch).toHaveBeenCalledWith('/ai/jobs/j1/consume', { method: 'POST' });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @nutri-plus/web test -- ai-jobs`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar o cliente HTTP**

Criar `apps/web/src/lib/api/ai-jobs.ts`:

```ts
import type { AiJobDetail, AiJobView, CreateAiJobResponse } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listAiJobs(patientId: string): Promise<AiJobView[]> {
  return browserApiFetch<AiJobView[]>(`/ai/jobs?patientId=${patientId}`);
}

export function getAiJob(id: string): Promise<AiJobDetail> {
  return browserApiFetch<AiJobDetail>(`/ai/jobs/${id}`);
}

export function retryAiJob(id: string): Promise<CreateAiJobResponse> {
  return browserApiFetch<CreateAiJobResponse>(`/ai/jobs/${id}/retry`, { method: 'POST' });
}

export function consumeAiJob(id: string): Promise<void> {
  return browserApiFetch<void>(`/ai/jobs/${id}/consume`, { method: 'POST' });
}
```

- [ ] **Step 4: Trocar as assinaturas de generate/adjust**

Em `apps/web/src/lib/api/meal-plans.ts`, trocar as duas funções:

```ts
export function generateMealPlan(
  patientId: string,
  instructions?: string,
): Promise<CreateAiJobResponse> {
  return browserApiFetch<CreateAiJobResponse>('/ai/generate-meal-plan', {
    method: 'POST',
    body: { patientId, instructions },
  });
}

export function adjustMealPlan(
  planId: string,
  instructions: string,
): Promise<CreateAiJobResponse> {
  return browserApiFetch<CreateAiJobResponse>('/ai/adjust-meal-plan', {
    method: 'POST',
    body: { planId, instructions },
  });
}
```

Acrescentar `CreateAiJobResponse` ao import de `@nutri-plus/shared-types` e remover `MealPlanDraft` do import se ficar sem uso.

- [ ] **Step 5: Criar os hooks**

Criar `apps/web/src/lib/queries/ai-jobs.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiJobView } from '@nutri-plus/shared-types';
import { consumeAiJob, getAiJob, listAiJobs, retryAiJob } from '@/lib/api/ai-jobs';

const ACTIVE: AiJobView['status'][] = ['PENDING', 'RUNNING'];

export function useAiJobs(patientId: string) {
  return useQuery({
    queryKey: ['ai-jobs', patientId],
    queryFn: () => listAiJobs(patientId),
    enabled: Boolean(patientId),
    // Só faz polling enquanto houver trabalho em voo: parado, a página não fica
    // batendo na API de graça.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((j) => ACTIVE.includes(j.status)) ? 2000 : false,
  });
}

export function useAiJob(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['ai-job', id],
    queryFn: () => getAiJob(id),
    enabled: enabled && Boolean(id),
  });
}

export function useRetryAiJob(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryAiJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-jobs', patientId] }),
  });
}

export function useConsumeAiJob() {
  return useMutation({ mutationFn: (id: string) => consumeAiJob(id) });
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `pnpm --filter @nutri-plus/web test -- ai-jobs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api/ai-jobs.ts apps/web/src/lib/api/ai-jobs.test.ts apps/web/src/lib/queries/ai-jobs.ts apps/web/src/lib/api/meal-plans.ts
git commit -m "feat(web): cliente e hooks de AiJob, com polling só enquanto há job ativo"
```

---

### Task 8: Diálogos disparam e fecham

**Files:**
- Modify: `apps/web/src/components/patients/ai-generate-dialog.tsx`
- Modify: `apps/web/src/components/patients/ai-adjust-dialog.tsx`
- Modify: `apps/web/src/lib/queries/meal-plans.ts`
- Test: `apps/web/src/components/patients/ai-generate-dialog.test.tsx`

**Interfaces:**
- Consumes: `useGenerateMealPlan` / `useAdjustMealPlan` agora resolvem `CreateAiJobResponse` (Task 7).
- Produces: diálogos que fecham imediatamente após disparar.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `apps/web/src/components/patients/ai-generate-dialog.test.tsx`:

```ts
it('fecha o diálogo assim que dispara, sem esperar o plano', async () => {
  const onOpenChange = vi.fn();
  generateMut.mockResolvedValue({ jobId: 'j1' });

  render(<AiGenerateDialog open onOpenChange={onOpenChange} patientId="p1" />);
  await userEvent.click(screen.getByRole('button', { name: /gerar plano/i }));

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  // Não navega mais para o plano: ele ainda não existe.
  expect(push).not.toHaveBeenCalled();
});
```

Adaptar os nomes `generateMut` e `push` aos mocks já existentes no arquivo.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @nutri-plus/web test -- ai-generate-dialog`
Expected: FAIL — hoje o diálogo navega para `plan.id`.

- [ ] **Step 3: Ajustar o hook de geração**

Em `apps/web/src/lib/queries/meal-plans.ts`, trocar:

```ts
export function useGenerateMealPlan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instructions?: string) => generateMealPlan(patientId, instructions),
    // O plano ainda não existe: o que muda de imediato é a lista de jobs.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-jobs', patientId] }),
  });
}
```

E `useAdjustMealPlan` passa a receber o `patientId` para invalidar a mesma chave:

```ts
export function useAdjustMealPlan(planId: string, patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instructions: string) => adjustMealPlan(planId, instructions),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-jobs', patientId] }),
  });
}
```

- [ ] **Step 4: Ajustar o AiGenerateDialog**

Em `onGenerate`, trocar o bloco de sucesso por:

```ts
      await generate.mutateAsync(trimmed || undefined);
      await tour.notifyChapterActionSucceeded();
      onOpenChange(false);
      toast.success('Gerando o plano em segundo plano. Avisamos quando ficar pronto.');
```

Remover `useRouter`, `router` e o `if (!consumed)`, já que não há mais para onde navegar.

- [ ] **Step 5: Ajustar o AiAdjustDialog**

`AiAdjustDialog` passa a receber `patientId` como prop (o editor já o tem). No `onAdjust`, trocar o sucesso por:

```ts
      await adjust.mutateAsync(trimmed);
      onOpenChange(false);
      toast.success('Ajustando o plano em segundo plano. Avisamos quando ficar pronto.');
```

Remover a prop `onApplied` e seu uso em `meal-plan-editor.tsx` — o rascunho passa a chegar pela faixa da Task 10. Na chamada dentro do editor, acrescentar `patientId={patientId}`.

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `pnpm --filter @nutri-plus/web test -- "ai-generate-dialog|ai-adjust|meal-plan-editor"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/patients apps/web/src/lib/queries/meal-plans.ts
git commit -m "feat(web): diálogos de IA disparam e fecham, sem prender o usuário"
```

---

### Task 9: Painel de processos na página do paciente

**Files:**
- Create: `apps/web/src/components/patients/ai-jobs-panel.tsx`
- Modify: `apps/web/src/components/patients/patient-detail.tsx`
- Test: `apps/web/src/components/patients/ai-jobs-panel.test.tsx`

**Interfaces:**
- Consumes: `useAiJobs`, `useRetryAiJob` (Task 7).
- Produces: `<AiJobsPanel patientId={string} />` — não renderiza nada quando não há job.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/components/patients/ai-jobs-panel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiJobView } from '@nutri-plus/shared-types';

const useAiJobsMock = vi.fn();
const retryMut = vi.fn();
vi.mock('@/lib/queries/ai-jobs', () => ({
  useAiJobs: (...a: unknown[]) => useAiJobsMock(...a),
  useRetryAiJob: () => ({ mutateAsync: retryMut, isPending: false }),
}));

import { AiJobsPanel } from './ai-jobs-panel';

function job(over: Partial<AiJobView> = {}): AiJobView {
  return {
    id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'RUNNING', patientId: 'p1',
    mealPlanId: null, error: null, createdAt: '2026-08-28T12:00:00.000Z',
    startedAt: '2026-08-28T12:00:00.000Z', finishedAt: null, isStuck: false, ...over,
  };
}

beforeEach(() => {
  retryMut.mockReset().mockResolvedValue({ jobId: 'j1' });
  useAiJobsMock.mockReset().mockReturnValue({ data: [], isLoading: false });
});

describe('AiJobsPanel', () => {
  it('não renderiza nada quando não há trabalho', () => {
    const { container } = render(<AiJobsPanel patientId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra a geração em andamento', () => {
    useAiJobsMock.mockReturnValue({ data: [job()], isLoading: false });
    render(<AiJobsPanel patientId="p1" />);
    expect(screen.getByText(/gerando plano/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tentar de novo/i })).not.toBeInTheDocument();
  });

  it('oferece repetir quando falhou e chama a mutação', async () => {
    useAiJobsMock.mockReturnValue({ data: [job({ status: 'FAILED', error: 'boom' })], isLoading: false });
    render(<AiJobsPanel patientId="p1" />);
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(retryMut).toHaveBeenCalledWith('j1');
  });

  it('oferece repetir quando travou', () => {
    useAiJobsMock.mockReturnValue({ data: [job({ isStuck: true })], isLoading: false });
    render(<AiJobsPanel patientId="p1" />);
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @nutri-plus/web test -- ai-jobs-panel`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Criar o painel**

Criar `apps/web/src/components/patients/ai-jobs-panel.tsx`:

```tsx
'use client';

import { toast } from 'sonner';
import type { AiJobView } from '@nutri-plus/shared-types';
import { useAiJobs, useRetryAiJob } from '@/lib/queries/ai-jobs';
import { Button } from '@/components/ui/button';

const LABEL: Record<AiJobView['type'], { running: string; failed: string }> = {
  MEAL_PLAN_GENERATION: { running: 'Gerando plano com IA…', failed: 'Falha ao gerar o plano.' },
  MEAL_PLAN_ADJUSTMENT: { running: 'Ajustando plano com IA…', failed: 'Falha ao ajustar o plano.' },
};

export function AiJobsPanel({ patientId }: { patientId: string }) {
  const query = useAiJobs(patientId);
  const retry = useRetryAiJob(patientId);
  const jobs = query.data ?? [];

  // Sem trabalho em curso, o bloco não existe — não somamos ruído à tela no
  // caso comum, que é não haver nada rodando.
  if (jobs.length === 0) return null;

  async function onRetry(id: string) {
    try {
      await retry.mutateAsync(id);
      toast.success('Tentando de novo.');
    } catch {
      toast.error('Não foi possível repetir agora.');
    }
  }

  return (
    <div className="mx-auto max-w-4xl rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Processos de IA</h2>
      <ul className="mt-2 space-y-2">
        {jobs.map((job) => {
          const failed = job.status === 'FAILED';
          const canRetry = failed || job.isStuck;
          return (
            <li key={job.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className={failed ? 'text-destructive' : 'text-muted-foreground'}>
                {failed ? LABEL[job.type].failed : LABEL[job.type].running}
                {job.isStuck && !failed && ' (parece travado)'}
              </span>
              {canRetry && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => onRetry(job.id)}
                  disabled={retry.isPending}
                >
                  Tentar de novo
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Montar na página do paciente**

Em `apps/web/src/components/patients/patient-detail.tsx`, importar e renderizar o painel logo acima de `<MealPlansSection …/>`:

Logo acima de `<MealPlansSection patientId={patient.id} canEdit={canEdit} />`:

```tsx
<AiJobsPanel patientId={patient.id} />
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `pnpm --filter @nutri-plus/web test -- "ai-jobs-panel|patient-detail"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/patients/ai-jobs-panel.tsx apps/web/src/components/patients/ai-jobs-panel.test.tsx apps/web/src/components/patients/patient-detail.tsx
git commit -m "feat(web): painel de processos de IA na página do paciente"
```

---

### Task 10: Faixa "Ajuste pronto" no editor

**Files:**
- Modify: `apps/web/src/components/patients/meal-plan-editor.tsx`
- Test: `apps/web/src/components/patients/meal-plan-editor.test.tsx`

**Interfaces:**
- Consumes: `useAiJobs` (Task 7), `useConsumeAiJob` (Task 7), `draftToDefaults` (já existe no editor).
- Produces: nada consumido por tarefas posteriores.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar os mocks junto dos demais no topo de `apps/web/src/components/patients/meal-plan-editor.test.tsx`:

```ts
const useAiJobsMock = vi.fn().mockReturnValue({ data: [], isLoading: false });
const consumeMut = vi.fn().mockResolvedValue(undefined);
const getAiJobMock = vi.fn();
vi.mock('@/lib/queries/ai-jobs', () => ({
  useAiJobs: (...a: unknown[]) => useAiJobsMock(...a),
  useConsumeAiJob: () => ({ mutateAsync: consumeMut, isPending: false }),
}));
vi.mock('@/lib/api/ai-jobs', () => ({ getAiJob: (...a: unknown[]) => getAiJobMock(...a) }));
```

E o caso de teste:

```tsx
it('oferece carregar o ajuste pronto e marca como consumido', async () => {
  useAiJobsMock.mockReturnValue({
    data: [{
      id: 'j1', type: 'MEAL_PLAN_ADJUSTMENT', status: 'DONE', patientId: 'p1',
      mealPlanId: null, error: null, createdAt: '2026-08-28T12:00:00.000Z',
      startedAt: null, finishedAt: '2026-08-28T12:01:00.000Z', isStuck: false,
    }],
    isLoading: false,
  });
  getAiJobMock.mockResolvedValue({ result: { title: 'Plano ajustado', meals: [] } });

  render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);

  await userEvent.click(await screen.findByRole('button', { name: /revisar ajuste/i }));

  expect(await screen.findByDisplayValue('Plano ajustado')).toBeInTheDocument();
  expect(consumeMut).toHaveBeenCalledWith('j1');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @nutri-plus/web test -- meal-plan-editor`
Expected: FAIL — a faixa não existe.

- [ ] **Step 3: Renderizar a faixa**

Em `apps/web/src/components/patients/meal-plan-editor.tsx`, dentro de `MealPlanEditor`, acrescentar:

```tsx
  const aiJobs = useAiJobs(patientId);
  const consume = useConsumeAiJob();
  // Um ajuste concluído e ainda não revisado para ESTE plano.
  const readyAdjust = (aiJobs.data ?? []).find(
    (j) => j.type === 'MEAL_PLAN_ADJUSTMENT' && j.status === 'DONE',
  );

  async function applyReadyAdjust(jobId: string) {
    try {
      const detail = await getAiJob(jobId);
      if (detail.result) {
        form.reset(draftToDefaults(detail.result));
        toast.success('Ajuste carregado — revise e salve.');
      }
      await consume.mutateAsync(jobId);
    } catch {
      toast.error('Não foi possível carregar o ajuste.');
    }
  }
```

E, logo acima da barra de totais:

```tsx
  {readyAdjust && (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-card p-3 text-sm">
      <span>Ajuste pronto para este plano.</span>
      <Button
        type="button"
        size="sm"
        className="rounded-full"
        onClick={() => applyReadyAdjust(readyAdjust.id)}
      >
        Revisar ajuste
      </Button>
    </div>
  )}
```

Imports a acrescentar: `useAiJobs`, `useConsumeAiJob` de `@/lib/queries/ai-jobs` e `getAiJob` de `@/lib/api/ai-jobs`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @nutri-plus/web test -- meal-plan-editor && pnpm --filter @nutri-plus/api test -- --testPathPattern ai-jobs`
Expected: PASS nos dois.

- [ ] **Step 5: Rodar as suítes completas**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/web test`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/patients/meal-plan-editor.tsx apps/web/src/components/patients/meal-plan-editor.test.tsx
git commit -m "feat(web): faixa de ajuste pronto no editor, marcada como consumida ao carregar

Preserva a revisão antes de aplicar: o rascunho do ajuste chega pela faixa e só
entra no formulário quando a nutricionista pede."
```

---

## Notas de deploy

Subir a **API antes do web**. Entre um e outro, um web antigo receberia `202 { jobId }` onde espera um `MealPlan` — janela curta, mas real. É a mesma ordem já usada na mudança de preço.
