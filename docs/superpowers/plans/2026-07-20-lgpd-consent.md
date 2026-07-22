# Consentimento LGPD (C1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar o consentimento LGPD do paciente no app mobile (gate obrigatório no 1º acesso, registro em `PatientConsent`) e exibir o status para o nutricionista no web.

**Architecture:** Aditivo. Nova tabela `PatientConsent` (histórico). O paciente (titular) consente no mobile via `POST /v1/me/consent`; o `GET /v1/me/consent` diz se precisa consentir (sem registro ou versão da política mudou). O gate bloqueia o `(app)` até aceitar. O nutricionista vê o status via `PatientDetail.latestConsent` (read-only). Versão da política numa constante do shared-types.

**Tech Stack:** NestJS + Prisma 7; Next.js (web); Expo + react-query (mobile); `@nutri-plus/shared-types`. Testes API+mobile JEST / web vitest.

## Global Constraints

- Migração **aditiva** (nova `PatientConsent` + back-relation em `PatientProfile`; nada existente alterado; `prisma migrate dev`; `prisma generate` se preciso). shared-types reconstruído. **Sem novas dependências** (Expo `Linking` já presente). pt-BR.
- O **paciente é o titular**: consentimento capturado **só no mobile**; web é **status read-only**. `me/consent` é escopo estrito do paciente (`resolveScopePatientId`, `@Roles(PATIENT)`).
- `CURRENT_PRIVACY_POLICY_VERSION = '2026-07-09'` no shared-types é a **fonte única** da "versão exigida"; o `POST` rejeita `policyVersion` divergente (`400`).
- `needsConsent = acceptedVersion == null || acceptedVersion !== CURRENT` (cobre re-consentimento no bump de versão).
- `latestConsent` entra **só no `PatientDetail`** (não no `PatientSummary`) — atualizar fixtures de `PatientDetail`.
- Gate **bloqueia** o `(app)` até aceitar; **Recusar → logout** (`signOut`).
- Combinar estilos de aspas por arquivo (api aspas simples; web/mobile por arquivo). Testes API+mobile JEST / web vitest.
- Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** dar push/PR. Branch `feat/lgpd-consent`. Verificar por área: shared-types build; API test+tsc; web test+tsc; mobile test+tsc.

## File Structure

- `packages/shared-types/src/v1/consent.ts` (novo) + `v1/index.ts` — tipos + constante.
- `apps/api/prisma/schema.prisma` (+ `PatientConsent` + `PatientProfile.consents`) + migração.
- `apps/api/src/consent/` — `consent.module.ts`, `me-consent.controller.ts`, `consent.service.ts`, `dto/accept-consent.dto.ts`, `consent.service.spec.ts`.
- `apps/api/src/app.module.ts` — registrar `ConsentModule`.
- `packages/shared-types/src/v1/patient.ts` — `PatientDetail += latestConsent` (T2).
- `apps/api/src/patients/patients.service.ts` (+ `consents` no include + `toDetail`) + spec (T2).
- `apps/mobile/lib/queries/consent.ts`, `apps/mobile/components/consent/consent-gate.tsx`, `apps/mobile/app/(app)/_layout.tsx` (T3) + testes.
- `apps/web/src/components/patients/patient-detail.tsx` (badge) + `patient-detail.test.tsx` (T4).

---

### Task 1: shared-types consent + Prisma + API `me/consent`

**Files:**
- Create: `packages/shared-types/src/v1/consent.ts`; Modify: `packages/shared-types/src/v1/index.ts`
- Modify: `apps/api/prisma/schema.prisma` (+ migração)
- Create: `apps/api/src/consent/{consent.module.ts,me-consent.controller.ts,consent.service.ts,dto/accept-consent.dto.ts,consent.service.spec.ts}`; Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `resolveScopePatientId` (`../auth/auth-scope`), `PrismaService`, `@Roles`/`@CurrentUser` (padrão `me/*`).
- Produces: `CURRENT_PRIVACY_POLICY_VERSION`, `MyConsentStatus`, `AcceptConsentRequest`, `PatientConsent` (shared-types); `GET/POST /v1/me/consent`.

- [ ] **Step 1: shared-types** — criar `packages/shared-types/src/v1/consent.ts`:
```ts
export const CURRENT_PRIVACY_POLICY_VERSION = '2026-07-09';

export interface PatientConsent {
  id: string;
  patientId: string;
  policyVersion: string;
  acceptedAt: string; // ISO
}

export interface MyConsentStatus {
  currentVersion: string;
  acceptedVersion: string | null;
  acceptedAt: string | null;
  needsConsent: boolean;
}

export interface AcceptConsentRequest {
  policyVersion: string;
}
```
Em `packages/shared-types/src/v1/index.ts`, adicionar: `export * from './consent';`

- [ ] **Step 2: Migração aditiva** — em `apps/api/prisma/schema.prisma`, no `model PatientProfile`, junto às outras relações (ex.: após `nutritionTargets NutritionTarget[]`), adicionar:
```prisma
  consents       PatientConsent[]
```
E adicionar o modelo (após `PatientProfile`, ou junto aos demais models):
```prisma
model PatientConsent {
  id            String   @id @default(uuid())
  patientId     String
  patient       PatientProfile @relation(fields: [patientId], references: [id], onDelete: Cascade)
  policyVersion String
  acceptedAt    DateTime @default(now())

  @@index([patientId, acceptedAt])
}
```
Rodar: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name patient_consent`
Expected: migração com `CREATE TABLE "PatientConsent"` + índice + FK — **sem** DROP/alteração de tabela existente. Client regenerado (`pnpm --filter @nutri-plus/api exec prisma generate` se o client não atualizar sozinho).

- [ ] **Step 3: shared-types build**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: sem erros.

- [ ] **Step 4: DTO** — criar `apps/api/src/consent/dto/accept-consent.dto.ts`:
```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class AcceptConsentDto {
  @IsString()
  @IsNotEmpty()
  policyVersion!: string;
}
```

- [ ] **Step 5: Service spec que falha** — criar `apps/api/src/consent/consent.service.spec.ts` (mockar PrismaService com `mockDeep`, mirar `nutrition-targets.service.spec.ts`; `ctx` de paciente com `user.patientProfile.id`):
```ts
import { BadRequestException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentService } from './consent.service';
import { AuthContext } from '../auth/types/auth-context';
import { CURRENT_PRIVACY_POLICY_VERSION } from '@nutri-plus/shared-types';

const ctx = { user: { role: 'PATIENT', patientProfile: { id: 'p1' } } } as unknown as AuthContext;

describe('ConsentService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: ConsentService;
  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new ConsentService(prisma);
  });

  it('needsConsent=true when there is no consent yet', async () => {
    prisma.patientConsent.findFirst.mockResolvedValue(null);
    const s = await service.getMine(ctx);
    expect(s).toEqual({
      currentVersion: CURRENT_PRIVACY_POLICY_VERSION,
      acceptedVersion: null,
      acceptedAt: null,
      needsConsent: true,
    });
  });

  it('needsConsent=true when the accepted version is stale', async () => {
    prisma.patientConsent.findFirst.mockResolvedValue({
      id: 'c0', patientId: 'p1', policyVersion: '2000-01-01', acceptedAt: new Date('2020-01-01'),
    } as any);
    const s = await service.getMine(ctx);
    expect(s.needsConsent).toBe(true);
    expect(s.acceptedVersion).toBe('2000-01-01');
  });

  it('needsConsent=false when the accepted version is current', async () => {
    prisma.patientConsent.findFirst.mockResolvedValue({
      id: 'c1', patientId: 'p1', policyVersion: CURRENT_PRIVACY_POLICY_VERSION, acceptedAt: new Date('2026-07-10'),
    } as any);
    const s = await service.getMine(ctx);
    expect(s.needsConsent).toBe(false);
    expect(s.acceptedAt).toBe(new Date('2026-07-10').toISOString());
  });

  it('accept records a consent at the current version and returns needsConsent=false', async () => {
    prisma.patientConsent.create.mockResolvedValue({} as any);
    prisma.patientConsent.findFirst.mockResolvedValue({
      id: 'c2', patientId: 'p1', policyVersion: CURRENT_PRIVACY_POLICY_VERSION, acceptedAt: new Date('2026-07-11'),
    } as any);
    const s = await service.accept(ctx, { policyVersion: CURRENT_PRIVACY_POLICY_VERSION });
    expect(prisma.patientConsent.create).toHaveBeenCalledWith({
      data: { patientId: 'p1', policyVersion: CURRENT_PRIVACY_POLICY_VERSION },
    });
    expect(s.needsConsent).toBe(false);
  });

  it('accept rejects a mismatched policyVersion (400) without creating', async () => {
    await expect(service.accept(ctx, { policyVersion: '2000-01-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.patientConsent.create).not.toHaveBeenCalled();
  });
});
```
Run: `pnpm --filter @nutri-plus/api test -- consent.service` → FAIL.

- [ ] **Step 6: Service** — criar `apps/api/src/consent/consent.service.ts`:
```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { CURRENT_PRIVACY_POLICY_VERSION, MyConsentStatus } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopePatientId } from '../auth/auth-scope';
import { AcceptConsentDto } from './dto/accept-consent.dto';

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(ctx: AuthContext): Promise<MyConsentStatus> {
    const patientId = resolveScopePatientId(ctx);
    const latest = await this.prisma.patientConsent.findFirst({
      where: { patientId },
      orderBy: { acceptedAt: 'desc' },
    });
    const acceptedVersion = latest?.policyVersion ?? null;
    return {
      currentVersion: CURRENT_PRIVACY_POLICY_VERSION,
      acceptedVersion,
      acceptedAt: latest ? latest.acceptedAt.toISOString() : null,
      needsConsent: acceptedVersion == null || acceptedVersion !== CURRENT_PRIVACY_POLICY_VERSION,
    };
  }

  async accept(ctx: AuthContext, dto: AcceptConsentDto): Promise<MyConsentStatus> {
    const patientId = resolveScopePatientId(ctx);
    if (dto.policyVersion !== CURRENT_PRIVACY_POLICY_VERSION) {
      throw new BadRequestException('Versão da política desatualizada.');
    }
    await this.prisma.patientConsent.create({
      data: { patientId, policyVersion: CURRENT_PRIVACY_POLICY_VERSION },
    });
    return this.getMine(ctx);
  }
}
```
Run: `pnpm --filter @nutri-plus/api test -- consent.service` → PASS.

- [ ] **Step 7: Controller + module + registro** — criar `apps/api/src/consent/me-consent.controller.ts` (mirar `me-nutrition-target.controller.ts`):
```ts
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { ConsentService } from './consent.service';
import { AcceptConsentDto } from './dto/accept-consent.dto';

@ApiTags('consent')
@ApiBearerAuth()
@Controller({ path: 'me/consent', version: '1' })
@Roles(UserRole.PATIENT)
export class MeConsentController {
  constructor(private readonly service: ConsentService) {}

  @Get()
  get(@CurrentUser() ctx: AuthContext) {
    return this.service.getMine(ctx);
  }

  @Post()
  accept(@CurrentUser() ctx: AuthContext, @Body() dto: AcceptConsentDto) {
    return this.service.accept(ctx, dto);
  }
}
```
Criar `apps/api/src/consent/consent.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConsentService } from './consent.service';
import { MeConsentController } from './me-consent.controller';

@Module({ controllers: [MeConsentController], providers: [ConsentService] })
export class ConsentModule {}
```
Em `apps/api/src/app.module.ts`, importar `ConsentModule` e adicionar ao array `imports` (junto aos outros feature modules). PrismaModule é `@Global` — sem import extra.

- [ ] **Step 8: Verificação da área + commit**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: verde; tsc 0.
```bash
git add packages/shared-types/src/v1/consent.ts packages/shared-types/src/v1/index.ts apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/consent apps/api/src/app.module.ts
git commit -m "feat(api): LGPD patient consent endpoints (me/consent)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `PatientDetail.latestConsent` (status para o nutricionista)

**Files:**
- Modify: `packages/shared-types/src/v1/patient.ts`
- Modify: `apps/api/src/patients/patients.service.ts` + `patients.service.spec.ts`
- Modify (fixtures, para manter web tsc verde): `apps/web/src/components/patients/{patient-detail.test.tsx,edit-patient-form.test.tsx,nutrition-targets-section.test.tsx}`

**Interfaces:**
- Consumes: o modelo `PatientConsent` (Task 1).
- Produces: `PatientDetail.latestConsent: { policyVersion: string; acceptedAt: string } | null`, preenchido pelo `getPatient`/`updatePatient`/`uploadPhoto`/`removePhoto`.

- [ ] **Step 1: shared-types** — em `packages/shared-types/src/v1/patient.ts`, no `interface PatientDetail extends PatientSummary`, adicionar:
```ts
export interface PatientDetail extends PatientSummary {
  assessments: BodyAssessment[];
  latestConsent: { policyVersion: string; acceptedAt: string } | null;
}
```
Build: `pnpm --filter @nutri-plus/shared-types build` (sem erros).

- [ ] **Step 2: Teste que falha (API)** — em `apps/api/src/patients/patients.service.spec.ts`, no(s) teste(s) de `getPatient`, mockar a relação `consents` e asseverar o mapeamento. Ler o spec atual para casar o mock de `patientProfile.findFirst`. Adicionar um caso: quando `consents: [{ policyVersion: '2026-07-09', acceptedAt: new Date('2026-07-10') }]`, `getPatient` retorna `latestConsent: { policyVersion: '2026-07-09', acceptedAt: <Date> }`; quando `consents: []`, `latestConsent: null`. (O `acceptedAt` é `Date` no retorno do service; serializa como ISO na resposta HTTP.)
Run: `pnpm --filter @nutri-plus/api test -- patients.service` → FAIL.

- [ ] **Step 3: Service** — em `apps/api/src/patients/patients.service.ts`:

(a) Incluir `consents` no `PATIENT_DETAIL_INCLUDE`:
```ts
const PATIENT_DETAIL_INCLUDE = {
  user: USER_SUMMARY,
  assessments: { orderBy: { assessmentDate: 'desc' as const }, take: 1 },
  consents: { orderBy: { acceptedAt: 'desc' as const }, take: 1 },
} as const;
```
(b) Fazer `getPatient` usar esse include (troca o include inline por `PATIENT_DETAIL_INCLUDE`):
```ts
  async getPatient(ctx: AuthContext, id: string) {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      include: PATIENT_DETAIL_INCLUDE,
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return this.toDetail(patient);
  }
```
(c) Adicionar o helper privado `toDetail` (consolida o `{ ...patient, imc }` dos 4 sites e mapeia `latestConsent`; genérico-estrutural para aceitar o payload do Prisma):
```ts
  private toDetail<
    T extends {
      height: number | null;
      assessments: { weight: number | null }[];
      consents: { policyVersion: string; acceptedAt: Date }[];
    },
  >(patient: T) {
    const { consents, ...rest } = patient;
    return {
      ...rest,
      imc: computeImc(patient.height, patient.assessments[0]?.weight ?? null),
      latestConsent: consents[0]
        ? { policyVersion: consents[0].policyVersion, acceptedAt: consents[0].acceptedAt }
        : null,
    };
  }
```
(d) Trocar os outros 3 `return { ...patient, imc: computeImc(...) };` (em `updatePatient`, `uploadPhoto`, `removePhoto`) por `return this.toDetail(patient);` (todos já usam `PATIENT_DETAIL_INCLUDE`, então têm `consents`).
Run: `pnpm --filter @nutri-plus/api test -- patients.service` → PASS.

- [ ] **Step 4: Fixtures do web (manter tsc verde)** — a mudança de `PatientDetail` torna `latestConsent` obrigatório. Rodar `pnpm --filter @nutri-plus/web exec tsc --noEmit` e, em cada fixture de `PatientDetail` que o tsc apontar (esperado: `patient-detail.test.tsx`, `edit-patient-form.test.tsx`, `nutrition-targets-section.test.tsx`), adicionar `latestConsent: null` ao objeto do paciente. Re-rodar até `tsc` limpo.

- [ ] **Step 5: Verificação + commit**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit` (verde) e `pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit` (verde — fixtures atualizadas).
```bash
git add packages/shared-types/src/v1/patient.ts apps/api/src/patients/patients.service.ts apps/api/src/patients/patients.service.spec.ts apps/web/src/components/patients/patient-detail.test.tsx apps/web/src/components/patients/edit-patient-form.test.tsx apps/web/src/components/patients/nutrition-targets-section.test.tsx
git commit -m "feat: PatientDetail.latestConsent (nutritionist sees consent status)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Gate de consentimento no app mobile

**Files:**
- Create: `apps/mobile/lib/queries/consent.ts`; `apps/mobile/components/consent/consent-gate.tsx` (+ `.test.tsx`)
- Modify: `apps/mobile/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `apiFetch` (`../api`); `useSession` (`../../lib/auth`, dá `{ session, loading, signOut }`); `MyConsentStatus` (shared-types); `GET/POST /v1/me/consent` (Task 1).
- Produces: `useMyConsent(enabled?)`, `useAcceptConsent()`, `<ConsentGate currentVersion />`; gate montado no `(app)/_layout`.

- [ ] **Step 1: Queries** — criar `apps/mobile/lib/queries/consent.ts` (mirar `nutrition-target.ts` + o padrão de mutation de `assessments.ts`):
```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyConsentStatus } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function getMyConsent(): Promise<MyConsentStatus> {
  return apiFetch<MyConsentStatus>('/me/consent');
}

export function useMyConsent(enabled = true) {
  return useQuery({ queryKey: ['me', 'consent'], queryFn: getMyConsent, enabled });
}

export function useAcceptConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policyVersion: string) =>
      apiFetch<MyConsentStatus>('/me/consent', { method: 'POST', body: { policyVersion } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'consent'] }),
  });
}
```

- [ ] **Step 2: Teste que falha (ConsentGate)** — criar `apps/mobile/components/consent/consent-gate.test.tsx` (mirar `meal-plan-view.test.tsx`; mockar `../../lib/queries/consent` e `../../lib/auth`):
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

const mutate = jest.fn();
const signOut = jest.fn();
jest.mock('../../lib/queries/consent', () => ({
  useAcceptConsent: () => ({ mutate, isPending: false, isError: false }),
}));
jest.mock('../../lib/auth', () => ({ useSession: () => ({ signOut }) }));

import { ConsentGate } from './consent-gate';

beforeEach(() => { mutate.mockReset(); signOut.mockReset(); });

describe('ConsentGate', () => {
  it('só habilita "Aceitar" depois de marcar o checkbox, e envia a versão atual', async () => {
    await render(<ConsentGate currentVersion="2026-07-09" />);
    const accept = screen.getByRole('button', { name: /aceitar e continuar/i });
    fireEvent.press(accept);
    expect(mutate).not.toHaveBeenCalled(); // desabilitado sem o checkbox
    fireEvent.press(screen.getByRole('checkbox'));
    fireEvent.press(accept);
    expect(mutate).toHaveBeenCalledWith('2026-07-09');
  });

  it('"Recusar" faz logout', async () => {
    await render(<ConsentGate currentVersion="2026-07-09" />);
    fireEvent.press(screen.getByRole('button', { name: /recusar/i }));
    expect(signOut).toHaveBeenCalled();
  });
});
```
Run: `pnpm --filter @nutri-plus/mobile test -- consent-gate` → FAIL.

- [ ] **Step 3: ConsentGate** — criar `apps/mobile/components/consent/consent-gate.tsx`. Usar o `Button` existente (`../ui/button` — ler suas props; ele expõe ao menos `label`/`onPress`/`loading`. Se não tiver `disabled`, guardar dentro do `onPress` via o estado `accepted`; para "Recusar", usar uma segunda instância/variant ou um `Pressable` estilizado). Estrutura:
```tsx
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '../ui/button';
import { useAcceptConsent } from '../../lib/queries/consent';
import { useSession } from '../../lib/auth';

const PRIVACY_POLICY_URL = 'https://inutri.life/privacy';

export function ConsentGate({ currentVersion }: { currentVersion: string }) {
  const [accepted, setAccepted] = useState(false);
  const accept = useAcceptConsent();
  const { signOut } = useSession();

  return (
    <ScrollView contentContainerClassName="grow justify-center gap-6 bg-background p-6">
      <Text className="font-heading text-2xl text-foreground">Consentimento de dados</Text>
      <Text className="font-sans text-base text-muted-foreground">
        Li e aceito a Política de Privacidade e autorizo o tratamento dos meus dados pessoais e de
        saúde pelo iNutri, conforme a LGPD (Lei 13.709/2018).
      </Text>
      <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} accessibilityRole="link">
        <Text className="font-sans-medium text-base text-primary">Ler política completa</Text>
      </Pressable>
      <Pressable
        onPress={() => setAccepted((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        className="flex-row items-center gap-3"
      >
        <View
          className={`h-6 w-6 rounded border border-border ${accepted ? 'bg-primary' : 'bg-transparent'}`}
        />
        <Text className="font-sans text-base text-foreground">Li e aceito</Text>
      </Pressable>
      {accept.isError ? (
        <Text className="font-sans text-sm text-destructive">
          Não foi possível registrar o consentimento. Tente novamente.
        </Text>
      ) : null}
      <Button
        label="Aceitar e continuar"
        loading={accept.isPending}
        onPress={() => {
          if (accepted) accept.mutate(currentVersion);
        }}
      />
      <Pressable onPress={signOut} accessibilityRole="button">
        <Text className="text-center font-sans-medium text-base text-muted-foreground">Recusar</Text>
      </Pressable>
    </ScrollView>
  );
}
```
(O `onPress` do "Aceitar" só dispara com `accepted` — garante a regra do teste sem depender de `disabled`. Se o `Button` do projeto tiver `disabled`, passe `disabled={!accepted}` também para o feedback visual.)
Run: `pnpm --filter @nutri-plus/mobile test -- consent-gate` → PASS.

- [ ] **Step 4: Montar o gate no layout** — em `apps/mobile/app/(app)/_layout.tsx`, buscar o consentimento após a sessão e bloquear:
```tsx
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../../lib/auth';
import { getTabBarColors, useTheme } from '../../lib/theme';
import { useMyConsent } from '../../lib/queries/consent';
import { ConsentGate } from '../../components/consent/consent-gate';

export default function AppLayout() {
  const { session, loading } = useSession();
  const { scheme } = useTheme();
  const consent = useMyConsent(!!session && !loading);
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (consent.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#14bfa6" />
      </View>
    );
  }
  if (consent.data?.needsConsent) {
    return <ConsentGate currentVersion={consent.data.currentVersion} />;
  }
  const tab = getTabBarColors(scheme);
  return (
    <Tabs
      /* ...screenOptions e Tabs.Screen inalterados... */
    >
      {/* ...os Tabs.Screen existentes... */}
    </Tabs>
  );
}
```
(Ordem de hooks: `useMyConsent` é chamado ANTES de qualquer `return`, sempre, e só habilita com sessão — não dispara pré-auth.)

- [ ] **Step 5: Teste do layout (gate vs app)** — em um teste do `(app)` layout (mirar `app-tabs.test.tsx`), mockar `useSession` (sessão válida), `useMyConsent` e `../../lib/theme`; asseverar que com `data.needsConsent=true` o `ConsentGate` é renderizado e com `false` os Tabs. Se o teste de Tabs for pesado, cobrir ao menos o ramo `needsConsent=true` (mock de `ConsentGate` para um stub). Run: `pnpm --filter @nutri-plus/mobile test -- _layout consent-gate` → PASS.

- [ ] **Step 6: Verificação + commit**

Run: `pnpm --filter @nutri-plus/mobile test && pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: verde; tsc 0.
```bash
git add apps/mobile/lib/queries/consent.ts apps/mobile/components/consent apps/mobile/app/(app)/_layout.tsx
git commit -m "feat(mobile): LGPD consent gate on first app entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Badge de status no web

**Files:**
- Modify: `apps/web/src/components/patients/patient-detail.tsx` + `patient-detail.test.tsx`

**Interfaces:**
- Consumes: `patient.latestConsent` (Task 2).
- Produces: linha de status "Consentimento LGPD: aceito em … / pendente".

- [ ] **Step 1: Teste que falha (vitest)** — em `apps/web/src/components/patients/patient-detail.test.tsx`, adicionar: (a) com `latestConsent: { policyVersion: '2026-07-09', acceptedAt: '2026-07-10T00:00:00.000Z' }`, o detalhe mostra `/Consentimento LGPD: aceito em/`; (b) com `latestConsent: null`, mostra `/Consentimento LGPD: pendente/`. (A fixture base já tem `latestConsent: null` da Task 2 — adicionar uma variante com consentimento para o caso (a).)
Run: `pnpm --filter @nutri-plus/web test -- patient-detail` → FAIL.

- [ ] **Step 2: Badge** — em `apps/web/src/components/patients/patient-detail.tsx`, dentro do bloco `<div className="min-w-0">` do header, logo após o `<p>` do e-mail (`{patient.user.email}`), adicionar:
```tsx
          <p className="mt-1 text-xs text-muted-foreground">
            {patient.latestConsent
              ? `Consentimento LGPD: aceito em ${new Date(patient.latestConsent.acceptedAt).toLocaleDateString('pt-BR')}`
              : 'Consentimento LGPD: pendente'}
          </p>
```
Run: `pnpm --filter @nutri-plus/web test -- patient-detail` → PASS.

- [ ] **Step 3: Verificação de todas as áreas + commit**

Run:
```
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile test && pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```
Expected: tudo verde.
```bash
git add apps/web/src/components/patients/patient-detail.tsx apps/web/src/components/patients/patient-detail.test.tsx
git commit -m "feat(web): LGPD consent status badge on patient detail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificação final

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile test && pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```

Manual (dev DB + um paciente que loga no app): 1º acesso ao app → o gate bloqueia; "Ler política completa" abre `/privacy`; marcar + "Aceitar e continuar" grava e libera o app; recusar faz logout. No web, o detalhe do paciente mostra "Consentimento LGPD: aceito em DD/MM/AAAA". Bumping `CURRENT_PRIVACY_POLICY_VERSION` faz o gate reaparecer no próximo acesso.

## Notas

- Entre a criação do paciente (nutricionista insere dados de saúde) e o 1º login existe dado sem consentimento digital — gap real de mundo (base legal/consentimento em papel), fora do escopo do C1.
- C2 (direitos do titular: exportar/excluir dados) é a próxima sub-parte de C.
