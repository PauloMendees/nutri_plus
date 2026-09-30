# Exclusão de paciente pela nutricionista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nutricionista exclui definitivamente um paciente; antes, o paciente recebe por e-mail um JSON com todos os seus dados e um texto explicativo — e se o e-mail falhar, nada é apagado.

**Architecture:** Na API, `PatientsService` ganha dois miolos extraídos — `buildPatientExport(patientId)` e `purgePatient(patientId)` — que passam a servir `exportMyData`, `deleteMyAccount` e o novo `deletePatient`. `DELETE /patients/:id` passa a tratar demo (como hoje) e paciente real (confirmação por nome → e-mail com anexo via `ResendService` → purge). `GET /patients/:id/export` serve o download quando o paciente não tem e-mail. No web, um diálogo de confirmação na ficha do paciente.

**Tech Stack:** NestJS + Prisma 7 + Jest (`apps/api`), Next.js + TanStack Query + Vitest (`apps/web`), `@nutri-plus/shared-types` (rebuild com `pnpm --filter @nutri-plus/shared-types build`).

**Spec:** `docs/superpowers/specs/2026-09-30-exclusao-de-paciente-design.md`

## Global Constraints

- Só `NUTRITIONIST`, só pacientes dela (`requireOwned`). `PatientsController` já é `@Roles(UserRole.NUTRITIONIST)` na classe — não abrir para `EMPLOYEE`.
- Paciente real exige `confirmName` igual ao nome, comparação `trim().toLocaleLowerCase('pt-BR')` dos dois lados; senão `BadRequestException('O nome digitado não confere.')`.
- Paciente demo: sem `confirmName`, sem e-mail (comportamento atual).
- Com e-mail: enviar **antes** de apagar; qualquer falha no envio → `BadGatewayException('Não foi possível enviar o e-mail com os dados; nada foi excluído.')` e nenhum dado removido.
- Sem e-mail: exclusão direta.
- Remetente: env `SUPPORT_FROM_EMAIL`; `replyTo`: e-mail da nutricionista (`User.email`).
- Nome do arquivo: `dados-{slug}-{AAAA-MM-DD}.json` (slug: sem acentos, minúsculo, não-alfanumérico → `-`, sem `-` nas pontas; data em America/Sao_Paulo).
- Nome da nutricionista no e-mail: `preferredNutritionistName(displayName, user.name)` (shared-types).
- Log sem dados pessoais: `patient deleted by nutritionist {nutritionistId} (email sent: yes|no)`.
- Copy em pt-BR; comentários explicam o porquê, no estilo vizinho.
- Baseline de `tsc` no web: 8 erros pré-existentes (`first-run-host.test.tsx`, `hub-view.test.tsx`, `ai-generate-dialog.test.tsx`) — não adicionar nenhum.

## Review Focus

1. Resend responde 5xx ou a env `SUPPORT_FROM_EMAIL` falta → nada é apagado e a nutricionista vê a mensagem de "nada foi excluído" (Task 3 + Task 4).
2. `confirmName` com maiúsculas/espaços diferentes ("  maria SILVA ") → aceito (Task 3).
3. Paciente com conta no app → a conta do Supabase também é removida (Task 1).
4. Paciente de outra nutricionista → 404 sem enviar e-mail nem apagar (Task 3).
5. Duplo clique em "Excluir definitivamente" → só uma requisição (botão desabilitado enquanto pendente) (Task 4).

---

## File Structure

**API (`apps/api/src`)**
- Modify `patients/patients.service.ts` — `purgePatient`, `buildPatientExport`, `deletePatient`, `exportPatientData`; remove `deleteDemoPatient`.
- Modify `patients/patients.service.spec.ts`
- Create `patients/patient-deleted-email.ts` + `.spec.ts` — template puro do e-mail.
- Create `patients/dto/delete-patient.dto.ts`
- Modify `patients/patients.controller.ts` — `DELETE :id` e `GET :id/export`.
- Modify `patients/patients.module.ts` — importa `SupportModule`.
- Modify `support/resend.service.ts` + `.spec.ts` — `attachments`.

**Shared (`packages/shared-types/src/v1`)**
- Create `patient-export.ts` — `patientExportFileName(name, date)`; exportar em `v1/index.ts`.

**Web (`apps/web/src`)**
- Modify `lib/api/patients.ts`, `lib/queries/patients.ts`
- Create `components/patients/delete-patient-dialog.tsx` + `.test.tsx`
- Modify `components/patients/patient-detail.tsx` + `.test.tsx`

---

### Task 1: `purgePatient` — exclusão em cascata única

**Files:**
- Modify: `apps/api/src/patients/patients.service.ts` (`deleteMyAccount`, `deleteDemoPatient`)
- Test: `apps/api/src/patients/patients.service.spec.ts`

**Interfaces:**
- Produces: `PatientsService.purgePatient(patientId: string): Promise<void>` (público, usado pela Task 3).

- [ ] **Step 1: Testes do purge (falhando)**

No `describe('PatientsService')` de `patients.service.spec.ts`, adicionar:

```ts
  describe('purgePatient', () => {
    beforeEach(() => {
      prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
    });

    it('deletes Restrict children, then the profile, then the user, in one transaction', async () => {
      prisma.patientProfile.findUnique.mockResolvedValue({
        userId: 'u1',
        photoUrl: null,
        user: { authProviderId: 'auth-1' },
      } as any);

      await service.purgePatient('pp1');

      for (const m of [
        prisma.outsideHomeRequest.deleteMany,
        prisma.aIInteraction.deleteMany,
        prisma.appointment.deleteMany,
        prisma.bodyAssessment.deleteMany,
        prisma.nutritionTarget.deleteMany,
        prisma.silhuetaScan.deleteMany,
        prisma.mealPlan.deleteMany,
      ]) {
        expect(m).toHaveBeenCalledWith({ where: { patientId: 'pp1' } });
      }
      expect(prisma.patientProfile.delete).toHaveBeenCalledWith({ where: { id: 'pp1' } });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
      const order = (m: { mock: { invocationCallOrder: number[] } }) => m.mock.invocationCallOrder[0];
      expect(order(prisma.mealPlan.deleteMany)).toBeLessThan(order(prisma.patientProfile.delete));
      expect(order(prisma.patientProfile.delete)).toBeLessThan(order(prisma.user.delete));
    });

    it('removes the app account, the photo and the audios after the transaction', async () => {
      prisma.patientProfile.findUnique.mockResolvedValue({
        userId: 'u1',
        photoUrl: 'https://x.supabase.co/storage/v1/object/public/patient-photos/pp1.png',
        user: { authProviderId: 'auth-1' },
      } as any);
      prisma.consultationAudio.findMany.mockResolvedValue([{ storagePath: 'nutri-1/pp1/a1.webm' }] as any);

      await service.purgePatient('pp1');

      expect(supabaseAdmin.deleteUser).toHaveBeenCalledWith('auth-1');
      expect(supabaseAdmin.removeObject).toHaveBeenCalledWith('patient-photos', 'pp1.png');
      expect(supabaseAdmin.removeObject).toHaveBeenCalledWith('consultation-audio', 'nutri-1/pp1/a1.webm');
    });

    it('skips the user and the app account for a ficha without login', async () => {
      prisma.patientProfile.findUnique.mockResolvedValue({ userId: null, photoUrl: null, user: null } as any);

      await service.purgePatient('pp1');

      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(supabaseAdmin.deleteUser).not.toHaveBeenCalled();
    });

    it('does not throw when removing the photo fails', async () => {
      prisma.patientProfile.findUnique.mockResolvedValue({
        userId: null,
        photoUrl: 'https://x/patient-photos/pp1.png',
        user: null,
      } as any);
      supabaseAdmin.removeObject.mockRejectedValue(new Error('storage down'));

      await expect(service.purgePatient('pp1')).resolves.toBeUndefined();
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run (em `apps/api`): `npx jest --config jest.config.ts src/patients/patients.service.spec.ts -t purgePatient`
Expected: FAIL — `service.purgePatient is not a function`.

- [ ] **Step 3: Implementar `purgePatient` e migrar `deleteMyAccount`**

Em `patients.service.ts`, substituir o comentário + corpo de `deleteMyAccount` por:

```ts
  // Permanently deletes the calling patient's account (patient-facing, app).
  async deleteMyAccount(ctx: AuthContext): Promise<void> {
    await this.purgePatient(resolveScopePatientId(ctx));
  }

  // Única exclusão em cascata de um paciente (conta do app, demo e exclusão pela
  // nutricionista). Every patient-owned child with onDelete: Restrict is removed
  // first, in one transaction, before the profile: OutsideHomeRequest,
  // AIInteraction, Appointment, BodyAssessment, NutritionTarget, SilhuetaScan,
  // MealPlan (its own children cascade). Then the profile, then the local user
  // (fichas sem login não têm). PatientConsent and ConsultationAudio cascade with
  // the profile. Only after the tx commits: the Supabase auth user, the photo and
  // each consultation-audio object — all best-effort, so a provider hiccup leaves
  // an orphan rather than resurrecting the now-deleted local data.
  async purgePatient(patientId: string): Promise<void> {
    // Read before teardown: these rows are gone after the tx.
    const profile = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { userId: true, photoUrl: true, user: { select: { authProviderId: true } } },
    });
    const audios = await this.prisma.consultationAudio.findMany({
      where: { patientId },
      select: { storagePath: true },
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
      if (profile?.userId) await tx.user.delete({ where: { id: profile.userId } });
    });

    if (profile?.user?.authProviderId) {
      await this.supabaseAdmin.deleteUser(profile.user.authProviderId);
    }

    if (profile?.photoUrl) {
      const path = profile.photoUrl.split('/').pop();
      if (path) {
        try {
          await this.supabaseAdmin.removeObject(PHOTO_BUCKET, path);
        } catch {
          // ignore — orphan file is acceptable
        }
      }
    }

    for (const a of audios) {
      try {
        await this.supabaseAdmin.removeObject('consultation-audio', a.storagePath);
      } catch {
        // ignore — orphan file is acceptable
      }
    }
  }
```

Keep `deleteDemoPatient` for now (Task 3 replaces it) but make its body, after the `isDemo` check, a single `await this.purgePatient(id);` (delete the old `$transaction([...])` block).

- [ ] **Step 4: Ajustar testes existentes que dependiam do corpo antigo**

- `describe('deleteMyAccount')`: the test "tears down…" asserts `supabaseAdmin.deleteUser` with `'auth-p'` read off `ctx.user`. Now the id comes from the profile lookup. In that test (and the photo test), mock:
  ```ts
  prisma.patientProfile.findUnique.mockResolvedValue({
    userId: 'user-p', photoUrl: null, user: { authProviderId: 'auth-p' },
  } as any);
  ```
  (photo test: keep its `photoUrl`, add `userId: 'user-p', user: { authProviderId: 'auth-p' }`). Update the test title comment "reads the id off ctx.user" → "reads the auth id from the patient's user".
- `describe('deleteDemoPatient')`: add `prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));` in each demo test that expects deletes, and mock `prisma.patientProfile.findUnique` returning `{ userId: <same as findFirst>, photoUrl: null, user: <userId ? { authProviderId: 'auth-d' } : null> }`.

- [ ] **Step 5: Rodar**

Run: `npx jest --config jest.config.ts src/patients`
Expected: PASS (todos os de `patients/`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/patients/patients.service.ts apps/api/src/patients/patients.service.spec.ts
git commit -m "refactor(api): purgePatient como exclusão em cascata única de paciente"
```

---

### Task 2: Anexo no Resend + template do e-mail + nome do arquivo

**Files:**
- Modify: `apps/api/src/support/resend.service.ts`, `apps/api/src/support/resend.service.spec.ts`
- Create: `packages/shared-types/src/v1/patient-export.ts`; Modify: `packages/shared-types/src/v1/index.ts`
- Create: `apps/api/src/patients/patient-deleted-email.ts`, `apps/api/src/patients/patient-deleted-email.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // resend.service.ts
  export interface EmailAttachment { filename: string; content: string } // base64
  // SendEmailInput ganha: attachments?: EmailAttachment[]
  // shared-types
  export function patientExportFileName(patientName: string, date?: Date): string;
  // patient-deleted-email.ts
  export interface PatientDeletedEmailInput { patientName: string; nutritionistName: string; fileName: string }
  export function buildPatientDeletedEmail(input: PatientDeletedEmailInput): { subject: string; text: string; html: string };
  ```

- [ ] **Step 1: Testes (falhando)**

Em `resend.service.spec.ts`, adicionar:

```ts
  it('repassa anexos para a API do Resend', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'email_1' }),
    } as Response);
    const svc = new ResendService({ get: () => 're_test_key' } as any);

    await svc.sendEmail({
      ...input,
      attachments: [{ filename: 'dados.json', content: 'eyJhIjoxfQ==' }],
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.attachments).toEqual([{ filename: 'dados.json', content: 'eyJhIjoxfQ==' }]);
  });
```

Criar `apps/api/src/patients/patient-deleted-email.spec.ts`:

```ts
import { patientExportFileName } from '@nutri-plus/shared-types';
import { buildPatientDeletedEmail } from './patient-deleted-email';

describe('patientExportFileName', () => {
  it('slugs the name without accents and dates it in São Paulo', () => {
    // 30/09 22:00 em São Paulo == 01/10 01:00 UTC.
    expect(patientExportFileName('  Lúcia Ferreira D’Ávila ', new Date('2026-10-01T01:00:00.000Z'))).toBe(
      'dados-lucia-ferreira-d-avila-2026-09-30.json',
    );
  });
});

describe('buildPatientDeletedEmail', () => {
  const mail = buildPatientDeletedEmail({
    patientName: 'maria silva',
    nutritionistName: 'Dra. Ana <Souza>',
    fileName: 'dados-maria-silva-2026-09-30.json',
  });

  it('names the nutritionist in the subject', () => {
    expect(mail.subject).toBe('Seus dados no iNutri — cadastro encerrado por Dra. Ana <Souza>');
  });

  it('greets by first name and explains the deletion, the file and the LGPD right', () => {
    expect(mail.text).toContain('Olá, Maria.');
    expect(mail.text).toContain('Dra. Ana <Souza> encerrou o seu cadastro no iNutri');
    expect(mail.text).toContain('dados-maria-silva-2026-09-30.json');
    expect(mail.text).toContain('Lei 13.709/2018, art. 18');
    expect(mail.text).toContain('responda este e-mail');
  });

  it('escapes names in the HTML version', () => {
    expect(mail.html).toContain('Dra. Ana &lt;Souza&gt;');
    expect(mail.html).not.toContain('<Souza>');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (em `apps/api`): `npx jest --config jest.config.ts src/support/resend src/patients/patient-deleted-email`
Expected: FAIL — `attachments` ausente no payload; módulo `./patient-deleted-email` inexistente; `patientExportFileName` não exportado.

- [ ] **Step 3: Implementar**

`resend.service.ts` — acima de `SendEmailInput`:

```ts
// Resend: `content` é o arquivo em base64.
export interface EmailAttachment {
  filename: string;
  content: string;
}
```

Em `SendEmailInput` adicionar `attachments?: EmailAttachment[];` e, em `sendEmail`, depois de `if (input.replyTo) …`:

```ts
    if (input.attachments?.length) payload.attachments = input.attachments;
```

`packages/shared-types/src/v1/patient-export.ts`:

```ts
// Nome do arquivo de dados do paciente (anexo do e-mail de exclusão e download
// no web): "dados-{nome sem acentos}-{AAAA-MM-DD}.json", dia de São Paulo.
export function patientExportFileName(patientName: string, date: Date = new Date()): string {
  const slug = patientName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return `dados-${slug || 'paciente'}-${day}.json`;
}
```

Em `packages/shared-types/src/v1/index.ts` adicionar `export * from './patient-export';`. Rodar `pnpm --filter @nutri-plus/shared-types build` (na raiz).

`apps/api/src/patients/patient-deleted-email.ts`:

```ts
import { escapeHtml, wrapTransactionalEmail } from '../support/transactional-email';

export interface PatientDeletedEmailInput {
  patientName: string;
  nutritionistName: string;
  fileName: string;
}

const BODY_P = 'margin:0 0 20px;font-size:15px;line-height:1.6;color:#5b6b64;';

function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
}

// E-mail enviado ao paciente ANTES da exclusão feita pela nutricionista, com o
// JSON dos dados anexado (acesso/portabilidade, LGPD art. 18).
export function buildPatientDeletedEmail(input: PatientDeletedEmailInput) {
  const who = input.nutritionistName;
  const hello = firstName(input.patientName) ? `Olá, ${firstName(input.patientName)}.` : 'Olá.';
  const subject = `Seus dados no iNutri — cadastro encerrado por ${who}`;
  const paragraphs = [
    `${who} encerrou o seu cadastro no iNutri, e os seus dados foram apagados da plataforma. Se você usava o app do iNutri, o acesso também foi removido.`,
    `Em anexo (${input.fileName}) está uma cópia de tudo o que estava salvo sobre você: dados de cadastro, anamnese, avaliações físicas, planos alimentares, recordatórios, metas, estimativas do Silhueta, consultas, consentimentos, transcrições de consultas e registros do diário.`,
    'O arquivo está em JSON, um formato de texto aberto: pode ser aberto em qualquer editor de texto e entregue a outro profissional. Esta cópia atende ao seu direito de acesso e portabilidade previsto na LGPD (Lei 13.709/2018, art. 18).',
    'Guarde o arquivo: depois desta exclusão não é possível recuperar os dados pelo iNutri.',
    `Dúvidas sobre o encerramento: responda este e-mail para falar com ${who}.`,
  ];
  const text = [hello, ...paragraphs].join('\n\n');
  const bodyHtml = [hello, ...paragraphs]
    .map((p) => `<p style="${BODY_P}">${escapeHtml(p)}</p>`)
    .join('\n');
  const html = wrapTransactionalEmail({
    title: 'Seu cadastro no iNutri foi encerrado',
    preheader: `Cópia dos seus dados em anexo — ${who}`,
    bodyHtml,
  });
  return { subject, text, html };
}
```

- [ ] **Step 4: Rodar**

Run: `npx jest --config jest.config.ts src/support src/patients/patient-deleted-email`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/support/resend.service.ts apps/api/src/support/resend.service.spec.ts packages/shared-types/src/v1/patient-export.ts packages/shared-types/src/v1/index.ts apps/api/src/patients/patient-deleted-email.ts apps/api/src/patients/patient-deleted-email.spec.ts
git commit -m "feat(api): anexos no Resend e e-mail de exclusão de paciente"
```

---

### Task 3: `deletePatient` + `GET /patients/:id/export`

**Files:**
- Modify: `apps/api/src/patients/patients.service.ts`, `patients.service.spec.ts`, `patients.controller.ts`, `patients.module.ts`
- Create: `apps/api/src/patients/dto/delete-patient.dto.ts`

**Interfaces:**
- Consumes: `purgePatient` (Task 1); `ResendService.sendEmail` com `attachments`, `buildPatientDeletedEmail`, `patientExportFileName` (Task 2); `preferredNutritionistName` (shared-types).
- Produces:
  ```ts
  deletePatient(ctx: AuthContext, id: string, confirmName?: string): Promise<void>;
  exportPatientData(ctx: AuthContext, id: string): Promise<PatientExport>; // PatientExport = ReturnType of buildPatientExport
  // HTTP: DELETE /v1/patients/:id  body { confirmName?: string } → 204
  //       GET    /v1/patients/:id/export → 200 JSON (mesmo formato de GET /me/export)
  ```

- [ ] **Step 1: Wiring do serviço nos testes**

`PatientsService` passa a receber `ResendService` e `ConfigService`. Em `patients.service.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { ResendService } from '../support/resend.service';
// …
  let resend: DeepMockProxy<ResendService>;
  let config: DeepMockProxy<ConfigService>;
// no beforeEach, antes de `service = …`:
    resend = mockDeep<ResendService>();
    config = mockDeep<ConfigService>();
    config.get.mockImplementation((key: string) =>
      key === 'SUPPORT_FROM_EMAIL' ? 'iNutri <contato@inutri.life>' : undefined,
    );
    service = new PatientsService(prisma, users, supabaseAdmin, metaActivation, resend, config);
```

Procurar outras construções: `rtk proxy grep -rn "new PatientsService(" apps/api/src` — atualizar todas com os dois argumentos novos (mocks).

- [ ] **Step 2: Testes de `deletePatient` (falhando)**

Substituir o `describe('deleteDemoPatient')` inteiro por:

```ts
  describe('deletePatient', () => {
    let purge: jest.SpyInstance;

    beforeEach(() => {
      purge = jest.spyOn(service, 'purgePatient').mockResolvedValue(undefined);
      prisma.nutritionistProfile.findUnique.mockResolvedValue({
        displayName: 'Dra. Ana',
        user: { name: 'Ana Souza', email: 'ana@clinica.com' },
      } as any);
    });

    function patient(over: Record<string, unknown> = {}) {
      prisma.patientProfile.findFirst.mockResolvedValue({
        id: 'pp1', name: 'Maria Silva', email: 'maria@x.com', isDemo: false, ...over,
      } as any);
    }

    it('404 for a patient of another nutritionist, without emailing or deleting', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);
      await expect(service.deletePatient(ctx, 'pp1', 'Maria Silva')).rejects.toBeInstanceOf(NotFoundException);
      expect(resend.sendEmail).not.toHaveBeenCalled();
      expect(purge).not.toHaveBeenCalled();
    });

    it('purges a demo patient without confirmation or email', async () => {
      patient({ isDemo: true });
      await service.deletePatient(ctx, 'pp1');
      expect(resend.sendEmail).not.toHaveBeenCalled();
      expect(purge).toHaveBeenCalledWith('pp1');
    });

    it('400 when the typed name does not match, deleting nothing', async () => {
      patient();
      await expect(service.deletePatient(ctx, 'pp1', 'Maria Souza')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.deletePatient(ctx, 'pp1')).rejects.toBeInstanceOf(BadRequestException);
      expect(purge).not.toHaveBeenCalled();
    });

    it('accepts the name with different case and surrounding spaces', async () => {
      patient({ email: null });
      await service.deletePatient(ctx, 'pp1', '  maria SILVA ');
      expect(purge).toHaveBeenCalledWith('pp1');
    });

    it('emails the data export as a JSON attachment before purging', async () => {
      patient();
      jest.spyOn(service as any, 'buildPatientExport').mockResolvedValue({ profile: { name: 'Maria Silva' } });

      await service.deletePatient(ctx, 'pp1', 'Maria Silva');

      const sent = resend.sendEmail.mock.calls[0][0];
      expect(sent.to).toBe('maria@x.com');
      expect(sent.from).toBe('iNutri <contato@inutri.life>');
      expect(sent.replyTo).toBe('ana@clinica.com');
      expect(sent.subject).toContain('Dra. Ana');
      expect(sent.attachments).toHaveLength(1);
      expect(sent.attachments![0].filename).toMatch(/^dados-maria-silva-\d{4}-\d{2}-\d{2}\.json$/);
      const json = JSON.parse(Buffer.from(sent.attachments![0].content, 'base64').toString('utf8'));
      expect(json).toEqual({ profile: { name: 'Maria Silva' } });
      expect(resend.sendEmail.mock.invocationCallOrder[0]).toBeLessThan(purge.mock.invocationCallOrder[0]);
    });

    it('502 and nothing deleted when the email fails', async () => {
      patient();
      jest.spyOn(service as any, 'buildPatientExport').mockResolvedValue({});
      resend.sendEmail.mockRejectedValue(new Error('resend down'));

      await expect(service.deletePatient(ctx, 'pp1', 'Maria Silva')).rejects.toBeInstanceOf(BadGatewayException);
      expect(purge).not.toHaveBeenCalled();
    });

    it('502 and nothing deleted when SUPPORT_FROM_EMAIL is not configured', async () => {
      patient();
      config.get.mockReturnValue(undefined);
      await expect(service.deletePatient(ctx, 'pp1', 'Maria Silva')).rejects.toBeInstanceOf(BadGatewayException);
      expect(resend.sendEmail).not.toHaveBeenCalled();
      expect(purge).not.toHaveBeenCalled();
    });

    it('purges without emailing a patient who has no e-mail', async () => {
      patient({ email: null });
      await service.deletePatient(ctx, 'pp1', 'Maria Silva');
      expect(resend.sendEmail).not.toHaveBeenCalled();
      expect(purge).toHaveBeenCalledWith('pp1');
    });
  });

  describe('exportPatientData', () => {
    it('404 for a patient of another nutritionist', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);
      await expect(service.exportPatientData(ctx, 'pp1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
```

Garantir imports no topo do spec: `BadGatewayException, BadRequestException, NotFoundException` de `@nestjs/common`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx jest --config jest.config.ts src/patients/patients.service.spec.ts -t "deletePatient|exportPatientData"`
Expected: FAIL — `service.deletePatient is not a function` (e construtor com argumentos extras).

- [ ] **Step 4: Implementar no serviço**

Imports em `patients.service.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { patientExportFileName, preferredNutritionistName } from '@nutri-plus/shared-types';
import { ResendService } from '../support/resend.service';
import { buildPatientDeletedEmail } from './patient-deleted-email';
```

(`BadGatewayException`, `BadRequestException` e `Logger` entram no import de `@nestjs/common`; juntar `patientExportFileName, preferredNutritionistName` ao import existente de `@nutri-plus/shared-types`.)

Construtor:

```ts
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly metaActivation: MetaActivationService,
    private readonly resend: ResendService,
    private readonly config: ConfigService,
  ) {}
```

`exportMyData`: renomear o método atual para `private async buildPatientExport(patientId: string)`, trocando a primeira linha `const patientId = resolveScopePatientId(ctx);` pela assinatura com parâmetro. Acima dele:

```ts
  // Patient-facing (LGPD access): the caller exports THEIR OWN data as one JSON
  // object. Scope resolves to the caller's own patientProfile — never another's.
  async exportMyData(ctx: AuthContext) {
    return this.buildPatientExport(resolveScopePatientId(ctx));
  }

  // Nutritionist-facing: o mesmo JSON, para baixar antes de excluir um paciente
  // sem e-mail.
  async exportPatientData(ctx: AuthContext, id: string) {
    await this.requireOwned(ctx, id);
    return this.buildPatientExport(id);
  }
```

Substituir `deleteDemoPatient` por:

```ts
  // Exclusão pela nutricionista. Demo: como antes, sem confirmação nem e-mail.
  // Paciente real: exige o nome digitado e, se tiver e-mail, envia a cópia dos
  // dados ANTES de apagar — falha no envio aborta sem remover nada. Irreversível.
  // OnboardingProgress.demoPatientId SetNulls.
  async deletePatient(ctx: AuthContext, id: string, confirmName?: string): Promise<void> {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id, nutritionistId },
      select: { id: true, name: true, email: true, isDemo: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    if (patient.isDemo) {
      await this.purgePatient(id);
      return;
    }

    const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');
    if (!confirmName || norm(confirmName) !== norm(patient.name)) {
      throw new BadRequestException('O nome digitado não confere.');
    }

    if (patient.email) {
      await this.emailPatientData(nutritionistId, { id, name: patient.name, email: patient.email });
    }

    await this.purgePatient(id);
    this.logger.log(
      `patient deleted by nutritionist ${nutritionistId} (email sent: ${patient.email ? 'yes' : 'no'})`,
    );
  }

  private async emailPatientData(
    nutritionistId: string,
    patient: { id: string; name: string; email: string },
  ): Promise<void> {
    const failure = new BadGatewayException(
      'Não foi possível enviar o e-mail com os dados; nada foi excluído.',
    );
    const from = this.config.get<string>('SUPPORT_FROM_EMAIL');
    if (!from) throw failure;

    const nutritionist = await this.prisma.nutritionistProfile.findUnique({
      where: { id: nutritionistId },
      select: { displayName: true, user: { select: { name: true, email: true } } },
    });
    const nutritionistName = preferredNutritionistName(
      nutritionist?.displayName,
      nutritionist?.user.name ?? 'sua nutricionista',
    );
    const fileName = patientExportFileName(patient.name);
    const data = await this.buildPatientExport(patient.id);
    const mail = buildPatientDeletedEmail({ patientName: patient.name, nutritionistName, fileName });

    try {
      await this.resend.sendEmail({
        to: patient.email,
        from,
        replyTo: nutritionist?.user.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachments: [
          { filename: fileName, content: Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64') },
        ],
      });
    } catch {
      throw failure;
    }
  }
```

- [ ] **Step 5: DTO, controller e módulo**

`apps/api/src/patients/dto/delete-patient.dto.ts`:

```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeletePatientDto {
  // Nome do paciente digitado na confirmação; obrigatório para paciente real.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  confirmName?: string;
}
```

Em `patients.controller.ts`, trocar o `removeDemo` por:

```ts
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() ctx: AuthContext, @Param('id') id: string, @Body() dto: DeletePatientDto) {
    return this.patients.deletePatient(ctx, id, dto?.confirmName);
  }

  @Get(':id/export')
  exportData(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.patients.exportPatientData(ctx, id);
  }
```

(import `DeletePatientDto` de `./dto/delete-patient.dto`; `Body`/`Get` já estão importados — conferir.) Nenhum `@Roles` na rota: vale o `@Roles(UserRole.NUTRITIONIST)` da classe.

Em `patients.module.ts`: `import { SupportModule } from '../support/support.module';` e adicionar `SupportModule` em `imports`. (`ConfigModule` é global — conferir `app.module.ts`; se não for, importar `ConfigModule` também.)

Procurar no controller spec (se existir) referências a `removeDemo`/`deleteDemoPatient`: `rtk proxy grep -rn "removeDemo\|deleteDemoPatient" apps/api/src` — atualizar para `remove`/`deletePatient`.

- [ ] **Step 6: Rodar**

Run: `npx jest --config jest.config.ts src/patients src/support` e depois a suíte toda `npx jest --config jest.config.ts`; `npx tsc --noEmit -p tsconfig.json`.
Expected: tudo PASS; tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/patients
git commit -m "feat(api): nutricionista exclui paciente com cópia dos dados por e-mail"
```

---

### Task 4: Web — diálogo de exclusão na ficha

**Files:**
- Modify: `apps/web/src/lib/api/patients.ts`, `apps/web/src/lib/queries/patients.ts`
- Create: `apps/web/src/components/patients/delete-patient-dialog.tsx`, `delete-patient-dialog.test.tsx`
- Modify: `apps/web/src/components/patients/patient-detail.tsx`, `patient-detail.test.tsx`

**Interfaces:**
- Consumes: `DELETE /patients/:id` `{ confirmName }`, `GET /patients/:id/export` (Task 3); `patientExportFileName` (Task 2).
- Produces:
  ```ts
  export function deletePatient(id: string, confirmName: string): Promise<void>;
  export function exportPatientData(id: string): Promise<unknown>;
  export function useDeletePatient(): UseMutationResult<void, unknown, { id: string; confirmName: string }>;
  export function DeletePatientDialog(props: { patient: { id: string; name: string; email: string | null }; open: boolean; onOpenChange(open: boolean): void }): JSX.Element;
  ```

- [ ] **Step 1: API client e query**

`lib/api/patients.ts` (após `deleteDemoPatient`):

```ts
export function deletePatient(id: string, confirmName: string): Promise<void> {
  return browserApiFetch<void>(`/patients/${id}`, { method: 'DELETE', body: { confirmName } });
}

export function exportPatientData(id: string): Promise<unknown> {
  return browserApiFetch<unknown>(`/patients/${id}/export`);
}
```

`lib/queries/patients.ts` (importar `deletePatient`):

```ts
export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmName }: { id: string; confirmName: string }) => deletePatient(id, confirmName),
    onSuccess: (_data, { id }) => {
      qc.removeQueries({ queryKey: ['patient', id] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
    },
  });
}
```

- [ ] **Step 2: Testes do diálogo (falhando)**

`components/patients/delete-patient-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';

const mutateAsync = vi.fn();
const pendingState = { isPending: false };
vi.mock('@/lib/queries/patients', () => ({
  useDeletePatient: () => ({ mutateAsync, isPending: pendingState.isPending }),
}));
const exportPatientData = vi.fn();
vi.mock('@/lib/api/patients', () => ({ exportPatientData: (...a: unknown[]) => exportPatientData(...a) }));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { DeletePatientDialog } from './delete-patient-dialog';

const withEmail = { id: 'p1', name: 'Maria Silva', email: 'maria@x.com' };
const noEmail = { ...withEmail, email: null };

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue(undefined);
  exportPatientData.mockReset().mockResolvedValue({ profile: { name: 'Maria Silva' } });
  push.mockReset();
  pendingState.isPending = false;
  Object.values(toast).forEach((f) => f.mockReset());
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

describe('DeletePatientDialog', () => {
  it('says the data copy goes to the patient e-mail', () => {
    render(<DeletePatientDialog patient={withEmail} open onOpenChange={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('maria@x.com');
  });

  it('keeps the delete button disabled until the name matches', async () => {
    render(<DeletePatientDialog patient={withEmail} open onOpenChange={() => {}} />);
    const btn = screen.getByRole('button', { name: /excluir definitivamente/i });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/digite o nome do paciente/i), 'Maria Souza');
    expect(btn).toBeDisabled();
    await userEvent.clear(screen.getByLabelText(/digite o nome do paciente/i));
    await userEvent.type(screen.getByLabelText(/digite o nome do paciente/i), '  maria SILVA ');
    expect(btn).toBeEnabled();
  });

  it('deletes, confirms and goes back to the list', async () => {
    render(<DeletePatientDialog patient={withEmail} open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByLabelText(/digite o nome do paciente/i), 'Maria Silva');
    await userEvent.click(screen.getByRole('button', { name: /excluir definitivamente/i }));
    expect(mutateAsync).toHaveBeenCalledWith({ id: 'p1', confirmName: 'Maria Silva' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/patients'));
    expect(toast.success).toHaveBeenCalledWith('Paciente excluído.');
  });

  it('shows that nothing was deleted when the e-mail fails (502)', async () => {
    mutateAsync.mockRejectedValue(new ApiError(502, 'x'));
    render(<DeletePatientDialog patient={withEmail} open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByLabelText(/digite o nome do paciente/i), 'Maria Silva');
    await userEvent.click(screen.getByRole('button', { name: /excluir definitivamente/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Não foi possível enviar o e-mail com os dados; nada foi excluído.'),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('disables the delete button while the request is pending', () => {
    pendingState.isPending = true;
    render(<DeletePatientDialog patient={withEmail} open onOpenChange={() => {}} />);
    expect(screen.getByRole('button', { name: /excluindo/i })).toBeDisabled();
  });

  it('offers a download when the patient has no e-mail', async () => {
    render(<DeletePatientDialog patient={noEmail} open onOpenChange={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveTextContent(/não tem e-mail cadastrado/i);
    await userEvent.click(screen.getByRole('button', { name: /baixar dados/i }));
    expect(exportPatientData).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });
});
```

Conferir o construtor de `ApiError` em `apps/web/src/lib/api/client.ts` e ajustar `new ApiError(502, 'x')` à assinatura real (status + mensagem/corpo).

- [ ] **Step 3: Rodar e ver falhar**

Run (em `apps/web`): `npx vitest run src/components/patients/delete-patient-dialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./delete-patient-dialog"`.

- [ ] **Step 4: Implementar o diálogo**

`components/patients/delete-patient-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { patientExportFileName } from '@nutri-plus/shared-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api/client';
import { exportPatientData } from '@/lib/api/patients';
import { useDeletePatient } from '@/lib/queries/patients';

// Mesma normalização da API (confirmName): maiúsculas e espaços nas pontas não contam.
const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

export function DeletePatientDialog({
  patient,
  open,
  onOpenChange,
}: {
  patient: { id: string; name: string; email: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const del = useDeletePatient();
  const [typed, setTyped] = useState('');
  const [downloading, setDownloading] = useState(false);
  const matches = norm(typed) !== '' && norm(typed) === norm(patient.name);

  async function download() {
    setDownloading(true);
    try {
      const data = await exportPatientData(patient.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = patientExportFileName(patient.name);
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Não foi possível baixar os dados.');
    } finally {
      setDownloading(false);
    }
  }

  async function confirm() {
    try {
      await del.mutateAsync({ id: patient.id, confirmName: typed });
      toast.success('Paciente excluído.');
      onOpenChange(false);
      router.push('/patients');
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 502
          ? 'Não foi possível enviar o e-mail com os dados; nada foi excluído.'
          : 'Não foi possível excluir o paciente.',
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Excluir {patient.name}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Todos os dados do paciente serão apagados definitivamente: ficha, anamnese, avaliações,
            planos alimentares, recordatórios e gravações. Se ele usa o app, o acesso também será
            removido. Esta ação não pode ser desfeita.
          </p>
          {patient.email ? (
            <p>
              Enviaremos uma cópia dos dados para <strong className="text-foreground">{patient.email}</strong>{' '}
              antes de excluir.
            </p>
          ) : (
            <div className="space-y-2">
              <p>
                Este paciente não tem e-mail cadastrado. Baixe o arquivo com os dados antes de excluir.
              </p>
              <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={download} disabled={downloading}>
                {downloading ? 'Baixando…' : 'Baixar dados'}
              </Button>
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-foreground">Digite o nome do paciente para confirmar</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={patient.name} />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!matches || del.isPending}
            onClick={confirm}
          >
            {del.isPending ? 'Excluindo…' : 'Excluir definitivamente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Rodar o diálogo**

Run: `npx vitest run src/components/patients/delete-patient-dialog.test.tsx`
Expected: PASS (6).

- [ ] **Step 6: Botão na ficha (teste + implementação)**

Em `patient-detail.test.tsx`, no `vi.mock('@/lib/queries/patients', …)` existente, adicionar `useDeletePatient: () => ({ mutateAsync: vi.fn(), isPending: false })`; e mockar `@/lib/api/patients` com `exportPatientData: vi.fn()` se o arquivo ainda não mocka esse módulo. Adicionar os testes:

```tsx
  it('offers "Excluir paciente" to the nutritionist (canEdit)', async () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /excluir paciente/i }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(/excluir/i);
  });

  it('hides "Excluir paciente" without edit permission (employee)', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit={false} />);
    expect(screen.queryByRole('button', { name: /excluir paciente/i })).not.toBeInTheDocument();
  });
```

(Usar o fixture `patient` e a variável `usePatient` já existentes no arquivo; conferir os nomes reais antes.)

Em `patient-detail.tsx`: importar `DeletePatientDialog`, adicionar `const [deleting, setDeleting] = useState(false);` junto aos outros estados, e dentro do bloco `{canEdit && (<div className="mt-2 flex flex-wrap gap-2"> … </div>)}`, depois do botão "Remover foto":

```tsx
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full text-destructive"
                  onClick={() => setDeleting(true)}
                >
                  Excluir paciente
                </Button>
```

E, logo após o fechamento desse bloco `canEdit`:

```tsx
            {canEdit && (
              <DeletePatientDialog
                patient={{ id: patient.id, name: patient.name, email: patient.email }}
                open={deleting}
                onOpenChange={setDeleting}
              />
            )}
```

`canEdit` já é só nutricionista (`canManagePatients` em `app/(app)/patients/[id]/page.tsx`).

- [ ] **Step 7: Verificação completa**

Run (em `apps/web`): `npx vitest run`; `npx tsc --noEmit` (só os 8 erros de baseline); `npx eslint src/components/patients/delete-patient-dialog.tsx src/components/patients/patient-detail.tsx src/lib/api/patients.ts src/lib/queries/patients.ts`.
Expected: tudo PASS, sem erros novos.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/api/patients.ts apps/web/src/lib/queries/patients.ts apps/web/src/components/patients/delete-patient-dialog.tsx apps/web/src/components/patients/delete-patient-dialog.test.tsx apps/web/src/components/patients/patient-detail.tsx apps/web/src/components/patients/patient-detail.test.tsx
git commit -m "feat(web): excluir paciente pela ficha, com confirmação por nome"
```
