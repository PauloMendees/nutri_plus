# Direitos do Titular LGPD (C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao paciente os direitos LGPD de acesso (exportar meus dados em JSON) e corrigir a eliminação (a exclusão de conta que hoje falha para quem tem Meta/silhueta, + remover a foto do storage).

**Architecture:** Aditivo, sem migração. `GET /v1/me/data-export` monta um JSON com os dados do próprio paciente (escopo estrito). O `deleteMyAccount` existente ganha os deletes que faltam (`NutritionTarget`/`SilhuetaScan`, ambos FK Restrict) + remoção best-effort da foto de perfil. Um botão no app mobile baixa e compartilha o export (reusa o stack do download de PDF).

**Tech Stack:** NestJS + Prisma 7; Expo (`expo-file-system/legacy` + `expo-sharing`); `@nutri-plus/shared-types`. Testes API+mobile JEST.

## Global Constraints

- **Sem migração** (nenhuma mudança de schema). shared-types reconstruído. **Sem novas dependências** (`expo-file-system/legacy` + `expo-sharing` já usados no download do PDF de evolução).
- pt-BR. **Patient-facing (mobile); web/nutricionista inalterado.** `me/data-export` é escopo estrito do paciente (`resolveScopePatientId`, `@Roles(PATIENT)`) — nunca dados de outro paciente.
- Export = JSON (`application/json`), fotos por `photoUrl` (sem binários); silhuetas **não** guardam fotos (não há image URLs).
- Correção da exclusão: `deleteMyAccount` deve apagar `NutritionTarget` + `SilhuetaScan` **antes** do `patientProfile.delete`; remover a foto de perfil (bucket `patient-photos`) **best-effort** DEPOIS da transação (uma falha na remoção NÃO pode reverter/abortar a exclusão).
- Combinar estilos de aspas (api aspas simples; mobile por arquivo). Testes API+mobile JEST. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** dar push/PR. Branch `feat/lgpd-data-rights`. Verificar por área: shared-types build; API test+tsc; mobile test+tsc.

## File Structure

- `packages/shared-types/src/v1/data-export.ts` (novo — `MyDataExport`) + `v1/index.ts`.
- `apps/api/src/patients/patients.service.ts` — `exportMyData(ctx)` (T1) + `deleteMyAccount` fix (T2) + `patients.service.spec.ts`.
- `apps/api/src/patients/me.controller.ts` — `GET me/data-export` (T1).
- `apps/mobile/lib/queries/data-export.ts` (novo) + `apps/mobile/app/(app)/configuracoes/index.tsx` (botão) + testes (T3).

---

### Task 1: Export — `MyDataExport` + `GET /v1/me/data-export`

**Files:**
- Create: `packages/shared-types/src/v1/data-export.ts`; Modify: `packages/shared-types/src/v1/index.ts`
- Modify: `apps/api/src/patients/patients.service.ts`, `apps/api/src/patients/me.controller.ts`, `apps/api/src/patients/patients.service.spec.ts`

**Interfaces:**
- Consumes: `resolveScopePatientId` (`../auth/auth-scope`), `PrismaService`; existing shared-types `BodyAssessment`/`MealPlan`/`NutritionTarget`/`SilhuetaScan`/`Appointment`/`PatientConsent` + patient enums.
- Produces: `MyDataExport` (shared-types); `PatientsService.exportMyData(ctx): Promise<MyDataExport-shaped>`; `GET /v1/me/data-export`.

- [ ] **Step 1: shared-type** — criar `packages/shared-types/src/v1/data-export.ts`:
```ts
import type { ActivityLevel, Gender, PatientObjective } from './patient';
import type { BodyAssessment } from './assessment';
import type { MealPlan } from './meal-plan';
import type { NutritionTarget } from './nutrition-target';
import type { SilhuetaScan } from './silhueta';
import type { Appointment } from './appointment';
import type { PatientConsent } from './consent';

export interface MyDataExportProfile {
  name: string;
  email: string;
  birthDate: string | null;
  gender: Gender | null;
  height: number | null;
  targetWeight: number | null;
  objective: PatientObjective | null;
  activityLevel: ActivityLevel | null;
  restrictions: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  notes: string | null;
  canLogAssessments: boolean;
  showMealTargetToPatient: boolean;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// The patient's full data (LGPD access/portability). Dates are ISO strings over
// the wire. Photos are referenced by URL (profile photoUrl); silhueta scans store
// no images.
export interface MyDataExport {
  exportedAt: string;
  profile: MyDataExportProfile;
  assessments: BodyAssessment[];
  mealPlans: MealPlan[];
  nutritionTargets: NutritionTarget[];
  silhuetaScans: SilhuetaScan[];
  appointments: Appointment[];
  consents: PatientConsent[];
}
```
Em `packages/shared-types/src/v1/index.ts`, adicionar: `export * from './data-export';`
Build: `pnpm --filter @nutri-plus/shared-types build` (sem erros).

- [ ] **Step 2: Teste que falha (service)** — em `apps/api/src/patients/patients.service.spec.ts`, adicionar um `describe('exportMyData')` (mirar o mock de `mockDeep<PrismaService>` + `ctxPatient` já usados no arquivo). Mockar cada query e asseverar o envelope + escopo. Exemplo:
```ts
  describe('exportMyData', () => {
    it("returns the caller's own data, scoped by patientId, with all sections", async () => {
      prisma.patientProfile.findUniqueOrThrow.mockResolvedValue({
        birthDate: null, gender: null, height: 170, targetWeight: null, objective: null,
        activityLevel: null, restrictions: null, allergies: null, medicalConditions: null,
        notes: null, canLogAssessments: false, showMealTargetToPatient: false, photoUrl: null,
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
        user: { name: 'Ana', email: 'ana@x.com' },
      } as any);
      prisma.bodyAssessment.findMany.mockResolvedValue([{ id: 'a1' }] as any);
      prisma.mealPlan.findMany.mockResolvedValue([{ id: 'mp1' }] as any);
      prisma.nutritionTarget.findMany.mockResolvedValue([{ id: 'nt1' }] as any);
      prisma.silhuetaScan.findMany.mockResolvedValue([{ id: 's1' }] as any);
      prisma.appointment.findMany.mockResolvedValue([{ id: 'ap1' }] as any);
      prisma.patientConsent.findMany.mockResolvedValue([{ id: 'c1' }] as any);

      const out = await service.exportMyData(ctxPatient('pp-1', 'nutri-1'));

      // every collection query is scoped to the caller's patientId
      for (const m of [
        prisma.bodyAssessment.findMany, prisma.mealPlan.findMany, prisma.nutritionTarget.findMany,
        prisma.silhuetaScan.findMany, prisma.appointment.findMany, prisma.patientConsent.findMany,
      ]) {
        expect(m).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: 'pp-1' } }));
      }
      expect(out.profile).toEqual(expect.objectContaining({ name: 'Ana', email: 'ana@x.com', height: 170 }));
      expect(out).toEqual(expect.objectContaining({
        assessments: [{ id: 'a1' }], mealPlans: [{ id: 'mp1' }], nutritionTargets: [{ id: 'nt1' }],
        silhuetaScans: [{ id: 's1' }], appointments: [{ id: 'ap1' }], consents: [{ id: 'c1' }],
      }));
      expect(typeof out.exportedAt).toBe('string');
    });
  });
```
Run: `pnpm --filter @nutri-plus/api test -- patients.service` → FAIL (`exportMyData` não existe).

- [ ] **Step 3: `exportMyData`** — em `apps/api/src/patients/patients.service.ts`, adicionar o método (perto de `deleteMyAccount`). Importa o tipo se quiser anotar, mas o retorno pode ser inferido (rows do Prisma serializam como ISO no fio, igual a `getPatient`/`PatientDetail`):
```ts
  // Patient-facing (LGPD access): the caller exports THEIR OWN data as one JSON
  // object. Scope resolves to the caller's own patientProfile — never another's.
  async exportMyData(ctx: AuthContext) {
    const patientId = resolveScopePatientId(ctx);
    const p = await this.prisma.patientProfile.findUniqueOrThrow({
      where: { id: patientId },
      include: { user: { select: { name: true, email: true } } },
    });
    const [assessments, mealPlans, nutritionTargets, silhuetaScans, appointments, consents] =
      await Promise.all([
        this.prisma.bodyAssessment.findMany({ where: { patientId }, orderBy: { assessmentDate: 'asc' } }),
        this.prisma.mealPlan.findMany({
          where: { patientId },
          orderBy: { createdAt: 'asc' },
          include: {
            meals: {
              orderBy: { order: 'asc' },
              include: {
                options: { orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' } } } },
              },
            },
          },
        }),
        this.prisma.nutritionTarget.findMany({ where: { patientId }, orderBy: { targetDate: 'asc' } }),
        this.prisma.silhuetaScan.findMany({ where: { patientId }, orderBy: { scanDate: 'asc' } }),
        this.prisma.appointment.findMany({ where: { patientId }, orderBy: { startsAt: 'asc' } }),
        this.prisma.patientConsent.findMany({ where: { patientId }, orderBy: { acceptedAt: 'asc' } }),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        name: p.user.name,
        email: p.user.email,
        birthDate: p.birthDate,
        gender: p.gender,
        height: p.height,
        targetWeight: p.targetWeight,
        objective: p.objective,
        activityLevel: p.activityLevel,
        restrictions: p.restrictions,
        allergies: p.allergies,
        medicalConditions: p.medicalConditions,
        notes: p.notes,
        canLogAssessments: p.canLogAssessments,
        showMealTargetToPatient: p.showMealTargetToPatient,
        photoUrl: p.photoUrl,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
      assessments,
      mealPlans,
      nutritionTargets,
      silhuetaScans,
      appointments,
      consents,
    };
  }
```
Run: `pnpm --filter @nutri-plus/api test -- patients.service` → PASS.

- [ ] **Step 4: Endpoint** — em `apps/api/src/patients/me.controller.ts`, adicionar (o controller já é `@Controller({ path: 'me', version: '1' }) @Roles(UserRole.PATIENT)`):
```ts
  @Get('data-export')
  exportData(@CurrentUser() ctx: AuthContext) {
    return this.patients.exportMyData(ctx);
  }
```
(`@Get` já está importado — o controller tem `@Get('nutritionist')`.)

- [ ] **Step 5: Verificação + commit**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: verde; tsc 0.
```bash
git add packages/shared-types/src/v1/data-export.ts packages/shared-types/src/v1/index.ts apps/api/src/patients/patients.service.ts apps/api/src/patients/me.controller.ts apps/api/src/patients/patients.service.spec.ts
git commit -m "feat(api): LGPD data export (GET me/data-export)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Correção da exclusão (`deleteMyAccount`)

**Files:**
- Modify: `apps/api/src/patients/patients.service.ts` (`deleteMyAccount`) + `patients.service.spec.ts`

**Interfaces:**
- Consumes: `PHOTO_BUCKET` (`'patient-photos'`), `supabaseAdmin.removeObject(bucket, path)` / `deleteUser(id)` (existentes).
- Produces: `deleteMyAccount` que também apaga `nutritionTarget`/`silhuetaScan` + remove a foto (best-effort).

- [ ] **Step 1: Teste que falha (regressão)** — em `apps/api/src/patients/patients.service.spec.ts`, no `describe('deleteMyAccount')`: (a) no teste existente, adicionar asserções de que `prisma.nutritionTarget.deleteMany` e `prisma.silhuetaScan.deleteMany` são chamados com `{ where: { patientId: 'pp-1' } }` e **antes** do `patientProfile.delete`; (b) adicionar um teste novo do storage:
```ts
    it('reads the profile photo before teardown and removes it best-effort after', async () => {
      prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
      prisma.patientProfile.findUnique.mockResolvedValue({
        photoUrl: 'https://x.supabase.co/storage/v1/object/public/patient-photos/pp-1.png',
      } as any);

      await service.deleteMyAccount(ctxPatient('pp-1', 'nutri-1'));

      expect(supabaseAdmin.removeObject).toHaveBeenCalledWith('patient-photos', 'pp-1.png');
      // removal happens after the auth user is deleted
      const order = (m: { mock: { invocationCallOrder: number[] } }) => m.mock.invocationCallOrder[0];
      expect(order(supabaseAdmin.deleteUser)).toBeLessThan(order(supabaseAdmin.removeObject));
    });

    it('still resolves when the photo removal fails (best-effort)', async () => {
      prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
      prisma.patientProfile.findUnique.mockResolvedValue({
        photoUrl: 'https://x/patient-photos/pp-1.png',
      } as any);
      supabaseAdmin.removeObject.mockRejectedValue(new Error('storage down'));

      await expect(service.deleteMyAccount(ctxPatient('pp-1', 'nutri-1'))).resolves.toBeUndefined();
    });
```
(Nos testes existentes que não mockam `findUnique`, o `mockDeep` retorna `undefined` → `profile?.photoUrl` é falsy → `removeObject` não é chamado; mantêm-se verdes.)
Run: `pnpm --filter @nutri-plus/api test -- patients.service` → FAIL.

- [ ] **Step 2: Implementar o fix** — substituir o `deleteMyAccount` por:
```ts
  async deleteMyAccount(ctx: AuthContext): Promise<void> {
    const patientId = resolveScopePatientId(ctx);
    const userId = ctx.user!.id;
    const authProviderId = ctx.user!.authProviderId;

    // Read the photo path before teardown (the row is gone after the tx).
    const profile = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { photoUrl: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.outsideHomeRequest.deleteMany({ where: { patientId } });
      await tx.aIInteraction.deleteMany({ where: { patientId } });
      await tx.appointment.deleteMany({ where: { patientId } });
      await tx.bodyAssessment.deleteMany({ where: { patientId } });
      await tx.nutritionTarget.deleteMany({ where: { patientId } });
      await tx.silhuetaScan.deleteMany({ where: { patientId } });
      await tx.mealPlan.deleteMany({ where: { patientId } });
      await tx.patientProfile.delete({ where: { id: patientId } });
      await tx.user.delete({ where: { id: userId } });
    });

    await this.supabaseAdmin.deleteUser(authProviderId);

    // Best-effort: the account is already deleted; a failed object removal must
    // not surface as an error (an orphan file is acceptable).
    if (profile?.photoUrl) {
      const path = profile.photoUrl.split('/').pop();
      if (path) {
        try {
          await this.supabaseAdmin.removeObject(PHOTO_BUCKET, path);
        } catch {
          // ignore
        }
      }
    }
  }
```
Run: `pnpm --filter @nutri-plus/api test -- patients.service` → PASS.

- [ ] **Step 3: Verificação + commit**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: verde; tsc 0.
```bash
git add apps/api/src/patients/patients.service.ts apps/api/src/patients/patients.service.spec.ts
git commit -m "fix(api): account deletion also removes nutrition targets, silhueta scans + photo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Mobile — botão "Exportar meus dados"

**Files:**
- Create: `apps/mobile/lib/queries/data-export.ts` (+ `.test.tsx`)
- Modify: `apps/mobile/app/(app)/configuracoes/index.tsx`

**Interfaces:**
- Consumes: `GET /v1/me/data-export` (Task 1); `expo-file-system/legacy`, `expo-sharing`, `supabase` (`../supabase`); the existing `configuracoes` screen.
- Produces: `downloadMyData()`; a "Exportar meus dados" button.

- [ ] **Step 1: `downloadMyData`** — criar `apps/mobile/lib/queries/data-export.ts` (mirar `downloadEvolutionPdf` de `assessments.ts`):
```ts
// SDK 54's expo-file-system v19 moved cacheDirectory/downloadAsync to a legacy
// subpath (the new top-level downloadAsync is a throwing deprecation shim).
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from '../supabase';

// Downloads the authenticated data export (JSON) to a cache file, then opens the
// OS share sheet.
export async function downloadMyData(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const base = process.env.EXPO_PUBLIC_API_URL;
  const url = `${base}/v1/me/data-export`;
  const target = `${FileSystem.cacheDirectory}meus-dados-inutri.json`;
  const { uri } = await FileSystem.downloadAsync(url, target, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json' });
  }
}
```

- [ ] **Step 2: Teste que falha** — criar `apps/mobile/lib/queries/data-export.test.tsx` (mirar `assessments.test.tsx`):
```tsx
const mockDownloadAsync = jest.fn();
const mockIsAvailable = jest.fn();
const mockShareAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: (...a: unknown[]) => mockDownloadAsync(...a),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailable(),
  shareAsync: (...a: unknown[]) => mockShareAsync(...a),
}));
jest.mock('../supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));

import { downloadMyData } from './data-export';

beforeEach(() => {
  mockDownloadAsync.mockReset().mockResolvedValue({ uri: 'file:///cache/meus-dados-inutri.json' });
  mockIsAvailable.mockReset().mockResolvedValue(true);
  mockShareAsync.mockReset().mockResolvedValue(undefined);
  process.env.EXPO_PUBLIC_API_URL = 'https://api.test';
});

describe('downloadMyData', () => {
  it('downloads the data export with the auth header and shares it', async () => {
    await downloadMyData();
    expect(mockDownloadAsync).toHaveBeenCalledWith(
      'https://api.test/v1/me/data-export',
      'file:///cache/meus-dados-inutri.json',
      { headers: { Authorization: 'Bearer tok' } },
    );
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///cache/meus-dados-inutri.json',
      { mimeType: 'application/json', UTI: 'public.json' },
    );
  });
});
```
Run: `pnpm --filter @nutri-plus/mobile test -- data-export` → FAIL (RED). Depois do Step 1 já existir, este teste PASSA — se o Step 1 foi feito antes, garanta o RED removendo temporariamente o import ou rode direto para o GREEN (o arquivo do Step 1 é a implementação).

- [ ] **Step 3: Botão em configuracoes** — em `apps/mobile/app/(app)/configuracoes/index.tsx`:

Import:
```ts
import { downloadMyData } from '../../../lib/queries/data-export';
```
Estado (perto de `deleting`/`deleteError`):
```ts
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
```
Handler:
```ts
  async function onExport() {
    setExportError(null);
    setExporting(true);
    try {
      await downloadMyData();
    } catch {
      setExportError('Não foi possível exportar seus dados. Tente novamente.');
    } finally {
      setExporting(false);
    }
  }
```
Botão (mirar o estilo do bloco de "Apagar minha conta"; colocar acima dele, no mesmo `<View className="gap-2">` ou num próprio):
```tsx
        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={onExport}
            disabled={exporting}
            className="flex-row items-center justify-center gap-2 rounded-xl border border-border p-4"
          >
            <Ionicons name="download-outline" size={20} color={foregroundColor} />
            <Text className="font-sans-medium text-base text-foreground">
              {exporting ? 'Exportando…' : 'Exportar meus dados'}
            </Text>
          </Pressable>
          {exportError ? (
            <Text className="font-sans text-sm text-destructive">{exportError}</Text>
          ) : null}
        </View>
```
(`Ionicons`, `Pressable`, `Text`, `View`, `foregroundColor` já estão no arquivo.)

- [ ] **Step 4: Rodar + verificação + commit**

Run: `pnpm --filter @nutri-plus/mobile test -- data-export` (PASS), `pnpm --filter @nutri-plus/mobile test` (suíte verde), `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (exit 0).
```bash
git add apps/mobile/lib/queries/data-export.ts apps/mobile/lib/queries/data-export.test.tsx apps/mobile/app/(app)/configuracoes/index.tsx
git commit -m "feat(mobile): export my data button (LGPD access right)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificação final

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/mobile test && pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```

Manual (dev DB + um paciente logado no app): Configurações → "Exportar meus dados" abre o share com o JSON dos dados do paciente; "Apagar minha conta" funciona MESMO para um paciente que tenha uma Meta e/ou uma silhueta salvas (antes dava erro), e a foto de perfil some do bucket.

## Notas

- `exportMyData` retorna rows do Prisma (datas `Date`) que serializam como ISO no fio — mesma convenção de `getPatient`/`PatientDetail`; `MyDataExport` (strings) é o contrato do fio, não uma anotação forçada no service.
- A remoção da foto é **best-effort**: a conta/DB/auth já foram apagados quando ela roda; uma falha vira no-op (arquivo órfão aceitável), nunca um erro pro usuário.
