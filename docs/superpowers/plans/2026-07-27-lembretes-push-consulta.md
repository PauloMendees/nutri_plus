# Lembretes / Push ao Paciente (E1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notificar o paciente ~24h antes de uma consulta agendada, via Expo Push, com opt-in no app — sobre uma infra de push greenfield disparada por um Render Cron.

**Architecture:** `PatientPushToken` (token por device, presença = opt-in) + `Appointment.appointmentReminderSentAt` (dedup). Um módulo `notifications` na API: `me/push-tokens` (paciente registra/remove o token) + um `ExpoPushService` (fetch puro pro Expo) + `RemindersService.dispatch()` chamado por um endpoint interno protegido por segredo, que um Render Cron aciona a cada 30 min. Mobile: `expo-notifications` + um toggle em Configurações.

**Tech Stack:** NestJS + Prisma 7; Expo SDK 54 (`expo-notifications`, `expo-constants`, `expo-secure-store`); Expo Push API (fetch); Render Cron. API jest / mobile jest (jest-expo + @testing-library/react-native).

## Global Constraints

- Migração **aditiva** (`PatientPushToken` + `Appointment.appointmentReminderSentAt` + `PatientProfile.pushTokens`; convenção nutri_plus: campos camelCase, **sem** `@map`/`@db`, `@default(uuid())`, como `ConsultationAudio`; `prisma migrate dev`; `prisma generate` se o client não atualizar). shared-types reconstruído.
- **Nova dependência SÓ no mobile: `expo-notifications`** (aprovado — instalar com `npx expo install expo-notifications` p/ escolher a versão compatível com o SDK 54; adicionar ao `plugins` do `app.config.js`). Servidor: **sem** dep nova (fetch puro pro Expo). `@nestjs/schedule` **não** é adicionado (Render Cron dispara). pt-BR.
- **Paciente-scoped** pro que o paciente controla (`@Roles(UserRole.PATIENT)` + `resolveScopePatientId`). O endpoint de dispatch é **`@Public()`** mas **protegido pelo segredo** `x-reminder-key === REMINDER_DISPATCH_KEY` (fail-closed: sem segredo configurado → 401). Nunca exposto ao cliente. Nutricionista/web **inalterados** no E1.
- **Opt-in**: o token existe **só** enquanto o paciente optou (registrado no toggle de Configurações, apagado no desligar/logout e apagado no servidor em `DeviceNotRegistered` do Expo).
- **Um lembrete por consulta, ~24h antes** — janela do scan: `startsAt` em `(now, now+24h]`, `appointmentReminderSentAt IS NULL`, `patientId` definido. O dispatch **pula sem marcar** quando o paciente não tem token (pra opt-in-depois ainda disparar dentro da janela). `ExpoPushService` **nunca lança** pro dispatch (um token ruim não quebra o lote). Corpo do push formata `startsAt` em **America/Sao_Paulo**.
- Aspas: api simples; mobile por arquivo. Testes API JEST / mobile JEST / web vitest. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** push/PR. Branch `feat/lembretes-push`. Verificar por área: shared-types build; API test+tsc; mobile test+tsc; web tsc (não deve rippar).

## File Structure

- `apps/api/prisma/schema.prisma` (+ `PatientPushToken`, `Appointment.appointmentReminderSentAt`, `PatientProfile.pushTokens`) + migração.
- `packages/shared-types/src/v1/push.ts` (novo) + `v1/index.ts`.
- `apps/api/src/notifications/` — `notifications.module.ts`, `dto/register-push-token.dto.ts`, `push-tokens.service.ts`, `me-push-tokens.controller.ts`, `expo-push.service.ts`, `reminders.service.ts`, `internal-reminders.controller.ts` + specs.
- `apps/api/src/config/env.schema.ts` (+ `REMINDER_DISPATCH_KEY`) + `apps/api/src/app.module.ts` (registra o módulo).
- `render.yaml` (+ serviço `type: cron` + env).
- `apps/mobile/package.json` (+ `expo-notifications`) + `app.config.js` (plugin) + `apps/mobile/lib/push.ts` + `app/_layout.tsx` (handler) + `app/(app)/configuracoes/index.tsx` (toggle) (+ tests).

---

### Task 1: shared-types + migração (PatientPushToken)

**Files:** Modify `apps/api/prisma/schema.prisma`; Create `packages/shared-types/src/v1/push.ts`; Modify `packages/shared-types/src/v1/index.ts` (+ migração).

**Interfaces — Produces:** modelo Prisma `PatientPushToken`, `Appointment.appointmentReminderSentAt`, `PatientProfile.pushTokens`; shared-types `PushPlatform`, `RegisterPushTokenRequest`.

- [ ] **Step 1: schema.prisma** — adicionar o model (convenção do arquivo: camelCase, sem `@map`/`@db`, como `ConsultationAudio`):
```prisma
model PatientPushToken {
  id        String   @id @default(uuid())
  patientId String
  patient   PatientProfile @relation(fields: [patientId], references: [id], onDelete: Cascade)
  token     String   @unique
  platform  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([patientId])
}
```
No `model Appointment`, adicionar (junto aos outros campos): `appointmentReminderSentAt DateTime?`.
No `model PatientProfile`, na área de relações, adicionar: `pushTokens PatientPushToken[]`.

- [ ] **Step 2: shared-types** — criar `packages/shared-types/src/v1/push.ts`:
```ts
export type PushPlatform = 'ios' | 'android';

export interface RegisterPushTokenRequest {
  token: string;
  platform?: PushPlatform;
}
```
Em `packages/shared-types/src/v1/index.ts`: `export * from './push';`

- [ ] **Step 3: Migração** — Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name patient_push_token`. Espera-se SQL aditivo: `CREATE TABLE "PatientPushToken"` (+ unique em `token`, index em `patientId`, FK Cascade) + `ALTER TABLE "Appointment" ADD COLUMN "appointmentReminderSentAt"` — **sem** drop/alter de coluna existente. `prisma generate` se o client não atualizar.

- [ ] **Step 4: Build + commit**

Run: `pnpm --filter @nutri-plus/shared-types build` (limpo) e `pnpm --filter @nutri-plus/api exec tsc --noEmit` (limpo — confirma o client novo).
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared-types/src/v1/push.ts packages/shared-types/src/v1/index.ts
git commit -m "feat: PatientPushToken model + appointment reminder marker + shared types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: API — push-tokens (me/*)

**Files:** Create `apps/api/src/notifications/{notifications.module.ts,dto/register-push-token.dto.ts,push-tokens.service.ts,me-push-tokens.controller.ts,push-tokens.service.spec.ts}`; Modify `apps/api/src/app.module.ts`.

**Interfaces:**
- Consumes: `PatientPushToken` (T1), `resolveScopePatientId`, `PrismaService`.
- Produces: `PushTokensService.register(ctx, dto)` / `.unregister(ctx, token)`; rotas `PUT /v1/me/push-tokens`, `DELETE /v1/me/push-tokens/:token`; `NotificationsModule`.

- [ ] **Step 1: DTO** — criar `apps/api/src/notifications/dto/register-push-token.dto.ts`:
```ts
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token!: string;

  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: 'ios' | 'android';
}
```

- [ ] **Step 2: Service spec (RED)** — criar `apps/api/src/notifications/push-tokens.service.spec.ts` (mirar o estilo `mockDeep<PrismaService>` das specs de audios/food-recalls; `ctx` de PACIENTE):
```ts
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { PushTokensService } from './push-tokens.service';
import { AuthContext } from '../auth/types/auth-context';

const ctx = { user: { role: 'PATIENT', patientProfile: { id: 'p1' } } } as unknown as AuthContext;

describe('PushTokensService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: PushTokensService;
  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new PushTokensService(prisma);
  });

  it('upserts a token bound to the current patient', async () => {
    await service.register(ctx, { token: 'ExpoTok', platform: 'ios' });
    expect(prisma.patientPushToken.upsert).toHaveBeenCalledWith({
      where: { token: 'ExpoTok' },
      create: { patientId: 'p1', token: 'ExpoTok', platform: 'ios' },
      update: { patientId: 'p1', platform: 'ios' },
    });
  });

  it('deletes a token scoped to the current patient (no cross-patient delete)', async () => {
    await service.unregister(ctx, 'ExpoTok');
    expect(prisma.patientPushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'ExpoTok', patientId: 'p1' },
    });
  });
});
```
Run: `pnpm --filter @nutri-plus/api test -- push-tokens.service` → FAIL.

- [ ] **Step 3: Service (GREEN)** — criar `apps/api/src/notifications/push-tokens.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopePatientId } from '../auth/auth-scope';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@Injectable()
export class PushTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async register(ctx: AuthContext, dto: RegisterPushTokenDto): Promise<void> {
    const patientId = resolveScopePatientId(ctx);
    await this.prisma.patientPushToken.upsert({
      where: { token: dto.token },
      create: { patientId, token: dto.token, platform: dto.platform },
      update: { patientId, platform: dto.platform },
    });
  }

  async unregister(ctx: AuthContext, token: string): Promise<void> {
    const patientId = resolveScopePatientId(ctx);
    await this.prisma.patientPushToken.deleteMany({ where: { token, patientId } });
  }
}
```
Run: `pnpm --filter @nutri-plus/api test -- push-tokens.service` → PASS.

- [ ] **Step 4: Controller + module + registro** — criar `apps/api/src/notifications/me-push-tokens.controller.ts` (mirar `MeNutritionTargetController`):
```ts
import { Body, Controller, Delete, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { PushTokensService } from './push-tokens.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@ApiTags('push-tokens')
@ApiBearerAuth()
@Controller({ path: 'me/push-tokens', version: '1' })
@Roles(UserRole.PATIENT)
export class MePushTokensController {
  constructor(private readonly service: PushTokensService) {}

  @Put()
  register(@CurrentUser() ctx: AuthContext, @Body() dto: RegisterPushTokenDto) {
    return this.service.register(ctx, dto);
  }

  @Delete(':token')
  unregister(@CurrentUser() ctx: AuthContext, @Param('token') token: string) {
    return this.service.unregister(ctx, token);
  }
}
```
Criar `apps/api/src/notifications/notifications.module.ts` (por ora só o push-tokens; T3 adiciona os demais providers/controllers):
```ts
import { Module } from '@nestjs/common';
import { PushTokensService } from './push-tokens.service';
import { MePushTokensController } from './me-push-tokens.controller';

@Module({
  controllers: [MePushTokensController],
  providers: [PushTokensService],
})
export class NotificationsModule {}
```
Registrar `NotificationsModule` no array `imports` do `apps/api/src/app.module.ts` (junto aos outros módulos).

- [ ] **Step 5: Verificação + commit**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit` (verde; tsc limpo).
```bash
git add apps/api/src/notifications apps/api/src/app.module.ts
git commit -m "feat(api): patient push-token registration (me/push-tokens)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: API — ExpoPushService + reminders dispatch

**Files:** Create `apps/api/src/notifications/{expo-push.service.ts,reminders.service.ts,internal-reminders.controller.ts,expo-push.service.spec.ts,reminders.service.spec.ts,internal-reminders.controller.spec.ts}`; Modify `apps/api/src/notifications/notifications.module.ts`, `apps/api/src/config/env.schema.ts`.

**Interfaces:**
- Consumes: `PatientPushToken`, `Appointment` (T1), `PrismaService`, `ConfigService`, `@Public()`.
- Produces: `ExpoPushService.send(messages)`; `RemindersService.dispatch()`; rota `POST /v1/internal/reminders/dispatch`.

- [ ] **Step 1: env** — em `apps/api/src/config/env.schema.ts`, adicionar dentro do `z.object({...})` (fail-closed: opcional; o guard rejeita quando ausente): `REMINDER_DISPATCH_KEY: z.string().min(1).optional(),`

- [ ] **Step 2: ExpoPushService (RED)** — criar `apps/api/src/notifications/expo-push.service.spec.ts`:
```ts
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { ExpoPushService } from './expo-push.service';

describe('ExpoPushService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: ExpoPushService;
  const fetchMock = jest.fn();
  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new ExpoPushService(prisma);
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  it('posts the batch and counts ok tickets', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }) });
    const out = await service.send([
      { to: 'a', title: 't', body: 'b' },
      { to: 'c', title: 't', body: 'b' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('https://exp.host/--/api/v2/push/send', expect.objectContaining({ method: 'POST' }));
    expect(out.sent).toBe(2);
  });

  it('deletes tokens Expo reports as DeviceNotRegistered', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
    });
    prisma.patientPushToken.deleteMany.mockResolvedValue({ count: 1 } as any);
    const out = await service.send([
      { to: 'good', title: 't', body: 'b' },
      { to: 'stale', title: 't', body: 'b' },
    ]);
    expect(prisma.patientPushToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['stale'] } } });
    expect(out.tokensRemoved).toBe(1);
  });

  it('never throws when fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    await expect(service.send([{ to: 'a', title: 't', body: 'b' }])).resolves.toEqual({ sent: 0, tokensRemoved: 0 });
  });
});
```
Run: `pnpm --filter @nutri-plus/api test -- expo-push.service` → FAIL.

- [ ] **Step 3: ExpoPushService (GREEN)** — criar `apps/api/src/notifications/expo-push.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status: string;
  details?: { error?: string };
}

@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Envia um lote ao Expo. Remove tokens que o Expo reporta como não registrados.
  // NUNCA lança: um token ruim (ou o Expo fora do ar) não pode derrubar o dispatch.
  async send(messages: ExpoPushMessage[]): Promise<{ sent: number; tokensRemoved: number }> {
    if (messages.length === 0) return { sent: 0, tokensRemoved: 0 };
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];
      const toRemove = tickets.flatMap((ticket, i) =>
        ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? [messages[i].to] : [],
      );
      let tokensRemoved = 0;
      if (toRemove.length > 0) {
        const removed = await this.prisma.patientPushToken.deleteMany({ where: { token: { in: toRemove } } });
        tokensRemoved = removed.count;
      }
      const sent = tickets.filter((t) => t.status === 'ok').length;
      return { sent, tokensRemoved };
    } catch {
      this.logger.warn('Expo push send failed');
      return { sent: 0, tokensRemoved: 0 };
    }
  }
}
```
Run: `pnpm --filter @nutri-plus/api test -- expo-push.service` → PASS.

- [ ] **Step 4: RemindersService (RED)** — criar `apps/api/src/notifications/reminders.service.spec.ts`:
```ts
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { ExpoPushService } from './expo-push.service';
import { RemindersService } from './reminders.service';

describe('RemindersService.dispatch', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let expo: DeepMockProxy<ExpoPushService>;
  let service: RemindersService;
  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    expo = mockDeep<ExpoPushService>();
    service = new RemindersService(prisma, expo);
  });

  it('scans the 24h window for un-reminded appointments with a patient', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    await service.dispatch();
    const arg = prisma.appointment.findMany.mock.calls[0][0] as any;
    expect(arg.where.patientId).toEqual({ not: null });
    expect(arg.where.appointmentReminderSentAt).toBeNull();
    expect(arg.where.startsAt.gt).toBeInstanceOf(Date);
    expect(arg.where.startsAt.lte).toBeInstanceOf(Date);
  });

  it('skips WITHOUT marking when the patient has no token', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { id: 'a1', patientId: 'p1', title: 'Retorno', startsAt: new Date() } as any,
    ]);
    prisma.patientPushToken.findMany.mockResolvedValue([]);
    const out = await service.dispatch();
    expect(expo.send).not.toHaveBeenCalled();
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(out.sent).toBe(0);
  });

  it('sends then marks the appointment reminded when a token exists', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { id: 'a1', patientId: 'p1', title: 'Retorno', startsAt: new Date('2026-07-26T17:00:00Z') } as any,
    ]);
    prisma.patientPushToken.findMany.mockResolvedValue([{ token: 'ExpoTok' }] as any);
    expo.send.mockResolvedValue({ sent: 1, tokensRemoved: 0 });
    const out = await service.dispatch();
    expect(expo.send).toHaveBeenCalledWith([
      expect.objectContaining({ to: 'ExpoTok', title: 'Lembrete de consulta', data: { appointmentId: 'a1' } }),
    ]);
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' }, data: expect.objectContaining({ appointmentReminderSentAt: expect.any(Date) }) }),
    );
    expect(out.sent).toBe(1);
  });

  it('does not mark when nothing was sent (all tokens failed)', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { id: 'a1', patientId: 'p1', title: 'Retorno', startsAt: new Date() } as any,
    ]);
    prisma.patientPushToken.findMany.mockResolvedValue([{ token: 'stale' }] as any);
    expo.send.mockResolvedValue({ sent: 0, tokensRemoved: 1 });
    const out = await service.dispatch();
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(out.tokensRemoved).toBe(1);
  });
});
```
Run: `pnpm --filter @nutri-plus/api test -- reminders.service` → FAIL.

- [ ] **Step 5: RemindersService (GREEN)** — criar `apps/api/src/notifications/reminders.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExpoPushService } from './expo-push.service';

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

function formatBrDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
  ) {}

  async dispatch(): Promise<{ scanned: number; sent: number; tokensRemoved: number }> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);
    const appointments = await this.prisma.appointment.findMany({
      where: {
        patientId: { not: null },
        appointmentReminderSentAt: null,
        startsAt: { gt: now, lte: windowEnd },
      },
      select: { id: true, patientId: true, title: true, startsAt: true },
    });

    let sent = 0;
    let tokensRemoved = 0;
    for (const appointment of appointments) {
      const tokens = await this.prisma.patientPushToken.findMany({
        where: { patientId: appointment.patientId! },
        select: { token: true },
      });
      // Pula SEM marcar: se o paciente optar dentro da janela, o próximo scan envia.
      if (tokens.length === 0) continue;

      const body = `Sua consulta "${appointment.title}" é ${formatBrDateTime(appointment.startsAt)}.`;
      const result = await this.expoPush.send(
        tokens.map((t) => ({
          to: t.token,
          title: 'Lembrete de consulta',
          body,
          data: { appointmentId: appointment.id },
        })),
      );
      tokensRemoved += result.tokensRemoved;
      if (result.sent > 0) {
        await this.prisma.appointment.update({
          where: { id: appointment.id },
          data: { appointmentReminderSentAt: now },
        });
        sent += result.sent;
      }
    }
    return { scanned: appointments.length, sent, tokensRemoved };
  }
}
```
Run: `pnpm --filter @nutri-plus/api test -- reminders.service` → PASS.

- [ ] **Step 6: Internal controller (RED)** — criar `apps/api/src/notifications/internal-reminders.controller.spec.ts`:
```ts
import { UnauthorizedException } from '@nestjs/common';
import { mockDeep } from 'jest-mock-extended';
import { ConfigService } from '@nestjs/config';
import { RemindersService } from './reminders.service';
import { InternalRemindersController } from './internal-reminders.controller';

describe('InternalRemindersController', () => {
  const reminders = mockDeep<RemindersService>();
  function make(secret?: string) {
    const config = { get: () => secret } as unknown as ConfigService;
    return new InternalRemindersController(reminders, config);
  }

  it('401s when the key is missing or wrong', async () => {
    await expect(make('s3cret').dispatch('nope')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(make('s3cret').dispatch(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401s (fail-closed) when no secret is configured', async () => {
    await expect(make(undefined).dispatch('anything')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('dispatches when the key matches', async () => {
    reminders.dispatch.mockResolvedValue({ scanned: 0, sent: 0, tokensRemoved: 0 });
    await make('s3cret').dispatch('s3cret');
    expect(reminders.dispatch).toHaveBeenCalled();
  });
});
```
Run: `pnpm --filter @nutri-plus/api test -- internal-reminders.controller` → FAIL.

- [ ] **Step 7: Internal controller (GREEN)** — criar `apps/api/src/notifications/internal-reminders.controller.ts`:
```ts
import { Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { RemindersService } from './reminders.service';

@ApiTags('reminders')
@Controller({ path: 'internal/reminders', version: '1' })
export class InternalRemindersController {
  constructor(
    private readonly reminders: RemindersService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('dispatch')
  dispatch(@Headers('x-reminder-key') key?: string) {
    const expected = this.config.get<string>('REMINDER_DISPATCH_KEY');
    // Fail-closed: sem segredo configurado, a rota nunca abre.
    if (!expected || key !== expected) {
      throw new UnauthorizedException();
    }
    return this.reminders.dispatch();
  }
}
```
Registrar em `notifications.module.ts`: adicionar `ExpoPushService` + `RemindersService` aos `providers` e `InternalRemindersController` aos `controllers`. (`ConfigService` já é global via `ConfigModule`.)

- [ ] **Step 8: Verificação + commit**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit` (verde; tsc limpo).
```bash
git add apps/api/src/notifications apps/api/src/config/env.schema.ts
git commit -m "feat(api): appointment reminder dispatch (Expo push + protected endpoint)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Render Cron wiring

**Files:** Modify `render.yaml`.

- [ ] **Step 1: cron service + env** — em `render.yaml`, no serviço `web` `nutri-plus-api`, adicionar aos `envVars` (o mesmo segredo que a API lê):
```yaml
      - key: REMINDER_DISPATCH_KEY
        sync: false
```
E adicionar um novo serviço ao array `services` (a cada 30 min chama o endpoint protegido; usa `bun`, que já está na imagem, evitando depender de `curl`):
```yaml
  - type: cron
    name: nutri-plus-reminders
    runtime: docker
    region: oregon
    schedule: "*/30 * * * *"
    dockerfilePath: apps/api/Dockerfile
    dockerContext: .
    dockerCommand: bun -e "const r = await fetch(process.env.REMINDER_DISPATCH_URL, { method: 'POST', headers: { 'x-reminder-key': process.env.REMINDER_DISPATCH_KEY } }); console.log(r.status); process.exit(r.ok ? 0 : 1)"
    envVars:
      # https://<api-host>/v1/internal/reminders/dispatch — set in the Render dashboard.
      - key: REMINDER_DISPATCH_URL
        sync: false
      - key: REMINDER_DISPATCH_KEY
        sync: false
```

- [ ] **Step 2: Verificação + commit**

Verificação: o YAML é válido (`bun -e "require('js-yaml')"` não está garantido; em vez disso, revisar visualmente a indentação — 2 espaços, alinhado ao serviço `web` existente) e o `dockerCommand` é uma linha só. Confirmar que `REMINDER_DISPATCH_KEY` aparece **tanto** no `web` quanto no `cron` (mesmo valor, setado no dashboard).
```bash
git add render.yaml
git commit -m "chore(deploy): Render cron to dispatch appointment reminders

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Mobile — expo-notifications + toggle de opt-in

**Files:** Modify `apps/mobile/package.json` (via expo install), `apps/mobile/app.config.js`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(app)/configuracoes/index.tsx`; Create `apps/mobile/lib/push.ts` (+ tests `apps/mobile/lib/push.test.ts` e a atualização do teste de Configurações).

**Interfaces:** Consumes `RegisterPushTokenRequest` (T1) + `PUT/DELETE /me/push-tokens` (T2).

- [ ] **Step 1: dependência + plugin** — instalar a versão compatível com o SDK 54:
```bash
cd apps/mobile && npx expo install expo-notifications
```
Em `apps/mobile/app.config.js`, adicionar `'expo-notifications'` ao array `plugins` (junto a `'expo-router'`, `'expo-secure-store'`, etc.).

- [ ] **Step 2: notification handler** — em `apps/mobile/app/_layout.tsx`, no topo do módulo (fora do componente), registrar o handler de foreground (usar a forma da API da versão instalada de `expo-notifications`; no SDK 54 é `shouldShowBanner`/`shouldShowList`):
```ts
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

- [ ] **Step 3: lib/push (RED)** — criar `apps/mobile/lib/push.test.ts`:
```ts
import { registerForPush, unregisterPush } from './push';

const getPermissions = jest.fn();
const requestPermissions = jest.fn();
const getToken = jest.fn();
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: () => getPermissions(),
  requestPermissionsAsync: () => requestPermissions(),
  getExpoPushTokenAsync: (opts: unknown) => getToken(opts),
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { eas: { projectId: 'proj-1' } } } }));
const apiFetch = jest.fn();
jest.mock('./api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

beforeEach(() => {
  getPermissions.mockReset();
  requestPermissions.mockReset();
  getToken.mockReset();
  apiFetch.mockReset().mockResolvedValue(undefined);
});

describe('registerForPush', () => {
  it('registers the Expo token when permission is granted', async () => {
    getPermissions.mockResolvedValue({ status: 'granted' });
    getToken.mockResolvedValue({ data: 'ExpoTok' });
    const result = await registerForPush();
    expect(getToken).toHaveBeenCalledWith({ projectId: 'proj-1' });
    expect(apiFetch).toHaveBeenCalledWith('/me/push-tokens', expect.objectContaining({ method: 'PUT' }));
    expect(result).toEqual({ token: 'ExpoTok' });
  });

  it('returns denied and registers nothing when permission is refused', async () => {
    getPermissions.mockResolvedValue({ status: 'undetermined' });
    requestPermissions.mockResolvedValue({ status: 'denied' });
    const result = await registerForPush();
    expect(result).toEqual({ denied: true });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('unregisterPush', () => {
  it('deletes the token', async () => {
    await unregisterPush('ExpoTok');
    expect(apiFetch).toHaveBeenCalledWith('/me/push-tokens/ExpoTok', { method: 'DELETE' });
  });
});
```
Run: `pnpm --filter @nutri-plus/mobile test -- push.test` → FAIL.

- [ ] **Step 4: lib/push (GREEN)** — criar `apps/mobile/lib/push.ts`:
```ts
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type { RegisterPushTokenRequest } from '@nutri-plus/shared-types';
import { apiFetch } from './api';

export type RegisterResult = { token: string } | { denied: true };

export async function registerForPush(): Promise<RegisterResult> {
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return { denied: true };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const body: RegisterPushTokenRequest = { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' };
  await apiFetch('/me/push-tokens', { method: 'PUT', body });
  return { token };
}

export async function unregisterPush(token: string): Promise<void> {
  await apiFetch(`/me/push-tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
}
```
Run: `pnpm --filter @nutri-plus/mobile test -- push.test` → PASS.

- [ ] **Step 5: toggle em Configurações (RED)** — no teste da tela (`apps/mobile/app/(app)/configuracoes/index.test.tsx`), adicionar cobertura: ao ligar o switch "Lembretes de consulta", chama `registerForPush`; ao desligar, chama `unregisterPush` com o token salvo. Mockar `../../../lib/push` e `expo-secure-store`. (Mirar os mocks já existentes no arquivo — `../../../lib/api`, `../../../lib/auth`, etc.) Exemplo do essencial:
```ts
jest.mock('../../../lib/push', () => ({ registerForPush: (...a: any) => registerForPush(...a), unregisterPush: (...a: any) => unregisterPush(...a) }));
const registerForPush = jest.fn();
const unregisterPush = jest.fn();
// expo-secure-store: getItemAsync/setItemAsync/deleteItemAsync mockados
// ... render <ConfiguracoesIndex/>, encontrar o switch por accessibilityLabel 'Lembretes de consulta',
// fireEvent(switch, 'valueChange', true) → espera registerForPush chamado;
// com token salvo, valueChange false → espera unregisterPush chamado com o token.
```
Run: `pnpm --filter @nutri-plus/mobile test -- configuracoes` → FAIL (o toggle ainda não existe).

- [ ] **Step 6: toggle (GREEN)** — em `apps/mobile/app/(app)/configuracoes/index.tsx`, adicionar uma seção "Notificações" com um `Switch` (RN). Imports: `Switch` de `react-native`, `useEffect`, `* as SecureStore from 'expo-secure-store'`, `registerForPush, unregisterPush from '../../../lib/push'`. Lógica:
```tsx
const [pushOn, setPushOn] = useState(false);
const [pushBusy, setPushBusy] = useState(false);

useEffect(() => {
  SecureStore.getItemAsync('push-token').then((t) => setPushOn(!!t));
}, []);

async function onTogglePush(next: boolean) {
  setPushBusy(true);
  try {
    if (next) {
      const result = await registerForPush();
      if ('denied' in result) {
        Alert.alert('Permissão negada', 'Ative as notificações nas configurações do sistema para receber lembretes.');
        setPushOn(false);
        return;
      }
      await SecureStore.setItemAsync('push-token', result.token);
      setPushOn(true);
    } else {
      const token = await SecureStore.getItemAsync('push-token');
      if (token) await unregisterPush(token);
      await SecureStore.deleteItemAsync('push-token');
      setPushOn(false);
    }
  } catch {
    Alert.alert('Erro', 'Não foi possível atualizar os lembretes. Tente novamente.');
    setPushOn(!next);
  } finally {
    setPushBusy(false);
  }
}
```
JSX (na lista de seções, ex.: depois de "Aparência"):
```tsx
<View className="gap-2">
  <Text className="font-sans-medium text-sm uppercase text-muted-foreground">Notificações</Text>
  <View className="flex-row items-center justify-between rounded-xl border border-border bg-card p-4">
    <Text className="font-sans-medium text-base text-foreground">Lembretes de consulta</Text>
    <Switch accessibilityLabel="Lembretes de consulta" value={pushOn} onValueChange={onTogglePush} disabled={pushBusy} />
  </View>
</View>
```
Run: `pnpm --filter @nutri-plus/mobile test -- configuracoes push.test` → PASS.

- [ ] **Step 7: Verificação de todas as áreas + commit**

Run:
```
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/mobile test && pnpm --filter @nutri-plus/mobile exec tsc --noEmit
pnpm --filter @nutri-plus/web exec tsc --noEmit
```
Expected: tudo verde (web tsc confirma que os shared-types novos não quebram — aditivo, e o web não consome `push.ts`).
```bash
git add apps/mobile/package.json apps/mobile/app.config.js apps/mobile/app/_layout.tsx "apps/mobile/app/(app)/configuracoes/index.tsx" "apps/mobile/app/(app)/configuracoes/index.test.tsx" apps/mobile/lib/push.ts apps/mobile/lib/push.test.ts pnpm-lock.yaml
git commit -m "feat(mobile): opt-in appointment reminders (expo-notifications + settings toggle)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificação final

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/mobile test && pnpm --filter @nutri-plus/mobile exec tsc --noEmit
pnpm --filter @nutri-plus/web exec tsc --noEmit
```

Manual (dev): no app do paciente → Configurações → ligar "Lembretes de consulta" (conceder permissão) → confirmar que `PUT /me/push-tokens` gravou o token. Criar (como nutri) uma consulta pra esse paciente com `startsAt` dentro de 24h. Chamar `curl -X POST "$API/v1/internal/reminders/dispatch" -H "x-reminder-key: $REMINDER_DISPATCH_KEY"` → o device recebe o push "Lembrete de consulta" e a consulta fica marcada (não reenvia). Desligar o toggle → `DELETE` apaga o token → o próximo dispatch pula.

## Notas

- **Sem infra de fila:** o dispatch é idempotente (marca `appointmentReminderSentAt`) e o Render Cron é o único disparo. Se o cron falhar uma rodada, a próxima (30 min depois) reprocessa — a janela de 24h absorve.
- **Reschedule:** se uma consulta já lembrada mudar de horário, não reenvia (aceitável no MVP).
- **E2 (futuro):** outros tipos de lembrete (peso, refeição), preferências por tipo, tela de agenda no app, horários silenciosos.
- **`setNotificationHandler` / permissões:** a forma exata da API (`shouldShowBanner` vs `shouldShowAlert`) segue a versão de `expo-notifications` instalada pelo `expo install` — conferir os tipos.
