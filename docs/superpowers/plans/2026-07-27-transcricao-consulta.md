# Transcrição da Consulta (v2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transcrever sob demanda o áudio de consulta já gravado (D1) via Whisper, processando em background (sem fila), exibindo o texto na aba Anamnese — ferramenta clínica do nutricionista.

**Architecture:** 4 colunas + 1 status enum aditivos no `ConsultationAudio`. Um novo método `transcribeAudio` no `OpenAIProvider` (único gateway do SDK) + `downloadObject` no `SupabaseAdminService`. O endpoint `POST .../transcribe` marca `PROCESSING` atomicamente, retorna na hora, e dispara a transcrição em background (não-awaited, nunca lança). A web faz poll enquanto houver `PROCESSING`.

**Tech Stack:** NestJS + Prisma 7 + `openai@^6.42.0` (Whisper) + Supabase Storage; Next.js + react-query + vitest. API jest.

## Global Constraints

- Migração **aditiva** (enum `TranscriptStatus` + 4 colunas em `ConsultationAudio` + valor `CONSULTATION_TRANSCRIPTION` no enum `AIInteractionType`; `prisma migrate dev`; `prisma generate` se o client não atualizar). shared-types reconstruído. **Sem novas dependências** (usa o `openai@^6.42.0` já instalado, **só** via `OpenAIProvider`). pt-BR.
- **NUTRICIONISTA-only**; paciente/mobile **INALTERADO**. `@Roles(UserRole.NUTRITIONIST)` + posse (paciente **e** áudio) → **404**, `resolveScopeNutritionistId`.
- **Sob demanda** (sem transcrição automática). O background é **não-awaited** e **NUNCA lança** pro caller (o POST já respondeu).
- **`PROCESSING` atômico** via `updateMany where status é null OR 'FAILED'` (usar `OR: [{ transcriptStatus: null }, { transcriptStatus: 'FAILED' }]` — **null-safe**; `{ in: [null, ...] }` NÃO casa linhas NULL em SQL); **idempotente** (`DONE`/`PROCESSING` retornam o registro atual sem reprocessar; `FAILED`/null reprocessam).
- `OpenAIProvider.transcribeAudio` registra o `AIInteraction` **SEM** o texto (PII), `type CONSULTATION_TRANSCRIPTION`, `estimatedCostUsd` via duração; `language: 'pt'`.
- `OPENAI_MODEL_TRANSCRIBE` default `'whisper-1'` (não exige mexer no `.env`).
- Transcript no `exportMyData` como `consultationTranscripts` (só `DONE`; `{ recordedAt, durationSec, transcript, transcribedAt }`; sem vazar de outro paciente).
- Web faz poll da lista de áudios via `refetchInterval` ativo **só** enquanto algum `audio.transcriptStatus === 'PROCESSING'`. `toDto` continua escondendo `storagePath`.
- Aspas: api simples; web por arquivo. Testes API JEST / web vitest. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** push/PR. Branch `feat/transcricao-consulta`. Verificar por área: shared-types build; API test+tsc; web test+tsc; mobile tsc.

## File Structure

- `apps/api/prisma/schema.prisma` (+ enum + 4 colunas + valor de enum) + migração.
- `packages/shared-types/src/v1/consultation-audio.ts` (+ campos + `TranscriptStatus` + `ConsultationTranscript`) + `v1/data-export.ts` (+ `consultationTranscripts`).
- `apps/api/src/supabase/supabase-admin.service.ts` (+ `downloadObject`).
- `apps/api/src/ai/{openai.provider.ts (+ transcribeAudio), pricing.ts (+ whisper), types/ai.types.ts}` + `apps/api/src/config/env.schema.ts` (+ env).
- `apps/api/src/patients/audios/{audios.service.ts (+ transcribe/runTranscription + AudioRow/toDto), audios.controller.ts (+ rota), audios.module.ts (+ AiModule)}` + specs.
- `apps/api/src/patients/patients.service.ts` (`exportMyData` + `consultationTranscripts`) + spec.
- `apps/web/src/lib/api/consultation-audio.ts` + `lib/queries/consultation-audio.ts` + `components/patients/consultation-audio-section.tsx` (+ tests).

---

### Task 1: shared-types + migração (campos de transcript)

**Files:** Modify `apps/api/prisma/schema.prisma`, `packages/shared-types/src/v1/consultation-audio.ts`, `packages/shared-types/src/v1/data-export.ts` (+ migração).

**Interfaces — Produces:** `TranscriptStatus`, os 4 campos em `ConsultationAudio`, `ConsultationTranscript`, `MyDataExport.consultationTranscripts`, enum Prisma `TranscriptStatus` + `AIInteractionType.CONSULTATION_TRANSCRIPTION`.

- [ ] **Step 1: schema.prisma** — adicionar o enum, os 4 campos e o valor de enum:
```prisma
enum TranscriptStatus {
  PROCESSING
  DONE
  FAILED
}
```
No `enum AIInteractionType`, adicionar como último valor: `CONSULTATION_TRANSCRIPTION`.
No `model ConsultationAudio`, adicionar (depois de `recordedAt`):
```prisma
  transcript       String?
  transcriptStatus TranscriptStatus?
  transcribedAt    DateTime?
  transcriptError  String?
```

- [ ] **Step 2: shared-types** — em `packages/shared-types/src/v1/consultation-audio.ts` substituir o conteúdo por:
```ts
// storagePath NÃO é exposto no fio — a reprodução usa signedUrl (URL assinada curta).
export type TranscriptStatus = 'PROCESSING' | 'DONE' | 'FAILED';

export interface ConsultationAudio {
  id: string;
  patientId: string;
  mimeType: string;
  durationSec: number | null;
  consentConfirmed: boolean;
  recordedAt: string;
  signedUrl: string;
  transcript: string | null;
  transcriptStatus: TranscriptStatus | null; // null = nunca transcrito
  transcribedAt: string | null;
  transcriptError: string | null;
}

// Export LGPD: as consultas transcritas do próprio paciente (só o texto, sem o áudio).
export interface ConsultationTranscript {
  recordedAt: string;
  durationSec: number | null;
  transcript: string;
  transcribedAt: string | null;
}
```
Em `packages/shared-types/src/v1/data-export.ts`: adicionar `import type { ConsultationTranscript } from './consultation-audio';` (junto aos outros imports) e, na interface `MyDataExport`, adicionar após `consents: PatientConsent[];` a linha `consultationTranscripts: ConsultationTranscript[];`.

- [ ] **Step 3: Migração** — Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name consultation_transcript`. Espera-se SQL aditivo: `CREATE TYPE "TranscriptStatus"`, `ALTER TYPE "AIInteractionType" ADD VALUE 'CONSULTATION_TRANSCRIPTION'`, e `ALTER TABLE "ConsultationAudio" ADD COLUMN` (×4) — **sem** DROP/ALTER de coluna existente. Se o client não atualizar: `pnpm --filter @nutri-plus/api exec prisma generate`.

- [ ] **Step 4: Build + commit**

Run: `pnpm --filter @nutri-plus/shared-types build` (limpo) e `pnpm --filter @nutri-plus/api exec tsc --noEmit` (limpo — confirma que o client tem os campos novos).
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared-types/src/v1/consultation-audio.ts packages/shared-types/src/v1/data-export.ts
git commit -m "feat: transcript fields on ConsultationAudio + shared types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: OpenAI Whisper + Storage download (plumbing)

**Files:** Modify `apps/api/src/supabase/supabase-admin.service.ts`, `apps/api/src/ai/openai.provider.ts`, `apps/api/src/ai/pricing.ts`, `apps/api/src/config/env.schema.ts`. Test: `apps/api/src/ai/pricing.spec.ts`, `apps/api/src/ai/openai.provider.spec.ts`.

**Interfaces:**
- Consumes: `AIInteractionType.CONSULTATION_TRANSCRIPTION` (T1), `AiInteractionsService.record` (existente).
- Produces: `SupabaseAdminService.downloadObject(bucket, path): Promise<Buffer>`; `OpenAIProvider.transcribeAudio(buffer: Buffer, filename: string, opts: { patientId?: string; durationSec?: number | null }): Promise<string>`; `estimateTranscriptionCostUsd(model: string, durationSec?: number): number | null`.

- [ ] **Step 1: env** — em `apps/api/src/config/env.schema.ts`, após `OPENAI_MODEL_FAST`, adicionar:
```ts
  OPENAI_MODEL_TRANSCRIBE: z.string().min(1).default('whisper-1'),
```

- [ ] **Step 2: downloadObject** — em `apps/api/src/supabase/supabase-admin.service.ts`, adicionar após `createSignedUrl` (espelha o try/catch + `BadGatewayException` de `uploadObject`):
```ts
  // Baixa um objeto privado como Buffer (para reprocessamento server-side, ex.: transcrição).
  async downloadObject(bucket: string, path: string): Promise<Buffer> {
    try {
      const { data, error } = await this.client.storage.from(bucket).download(path);
      if (error || !data) {
        throw error ?? new Error('no object');
      }
      return Buffer.from(await data.arrayBuffer());
    } catch {
      this.logger.warn(`Storage download failed (bucket=${bucket})`);
      throw new BadGatewayException('Storage download failed');
    }
  }
```
(`downloadObject` é um wrapper fino, testado via `AudiosService` no T3 — mesmo padrão dos `uploadObject`/`createSignedUrl` existentes, que não têm unit direto por dependerem do client Supabase.)

- [ ] **Step 3: pricing (RED)** — em `apps/api/src/ai/pricing.spec.ts`, adicionar (importe também `estimateTranscriptionCostUsd` no topo do arquivo de teste):
```ts
describe('estimateTranscriptionCostUsd', () => {
  it('bills whisper-1 per minute (600s = 10min → 0.06)', () => {
    expect(estimateTranscriptionCostUsd('whisper-1', 600)).toBeCloseTo(0.06, 5);
  });
  it('returns null for an unknown model or missing duration', () => {
    expect(estimateTranscriptionCostUsd('nope', 600)).toBeNull();
    expect(estimateTranscriptionCostUsd('whisper-1', undefined)).toBeNull();
  });
});
```
Run: `pnpm --filter @nutri-plus/api test -- pricing` → FAIL (função não existe).

- [ ] **Step 4: pricing (GREEN)** — em `apps/api/src/ai/pricing.ts`, adicionar:
```ts
// Whisper é cobrado por minuto de áudio, não por token.
const TRANSCRIPTION_PER_MINUTE_USD: Record<string, number> = {
  'whisper-1': 0.006,
};

export function estimateTranscriptionCostUsd(
  model: string,
  durationSec?: number,
): number | null {
  const perMinute = TRANSCRIPTION_PER_MINUTE_USD[model];
  if (perMinute === undefined || durationSec === undefined) {
    return null;
  }
  return (durationSec / 60) * perMinute;
}
```
Run: `pnpm --filter @nutri-plus/api test -- pricing` → PASS.

- [ ] **Step 5: transcribeAudio (RED)** — em `apps/api/src/ai/openai.provider.spec.ts`: adicionar `OPENAI_MODEL_TRANSCRIBE: 'whisper-1'` ao objeto `ENV`, e adicionar um bloco de teste (o mock do client espelha o padrão existente `(provider as any).client = ...`, mas para `audio.transcriptions`):
```ts
describe('OpenAIProvider.transcribeAudio', () => {
  function makeTranscribeProvider() {
    const config = {
      getOrThrow: (key: string) => {
        const env: Record<string, string> = {
          OPENAI_API_KEY: 'sk-test', OPENAI_MODEL_SMART: 'gpt-4o',
          OPENAI_MODEL_FAST: 'gpt-4o-mini', OPENAI_MODEL_TRANSCRIBE: 'whisper-1',
        };
        if (env[key] === undefined) throw new Error(`missing ${key}`);
        return env[key];
      },
    } as any;
    const interactions = mockDeep<AiInteractionsService>();
    const provider = new OpenAIProvider(config, interactions);
    const create = jest.fn();
    (provider as any).client = { audio: { transcriptions: { create } } };
    return { provider, interactions, create };
  }

  it('returns the transcript text and records a successful interaction WITHOUT the text', async () => {
    const { provider, interactions, create } = makeTranscribeProvider();
    create.mockResolvedValue({ text: 'olá paciente' });

    const text = await provider.transcribeAudio(Buffer.from('x'), 'audio.webm', { patientId: 'p1', durationSec: 600 });

    expect(text).toBe('olá paciente');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'whisper-1', language: 'pt' }),
    );
    const recorded = interactions.record.mock.calls[0][0];
    expect(recorded.type).toBe(AIInteractionType.CONSULTATION_TRANSCRIPTION);
    expect(recorded.success).toBe(true);
    expect(recorded.estimatedCostUsd).toBeCloseTo(0.06, 5);
    // Nunca grava o texto transcrito (PII):
    expect(JSON.stringify(recorded)).not.toContain('olá paciente');
  });

  it('records a failure and throws BadGatewayException when the API fails', async () => {
    const { provider, interactions, create } = makeTranscribeProvider();
    create.mockRejectedValue(new Error('boom'));

    await expect(
      provider.transcribeAudio(Buffer.from('x'), 'audio.webm', { patientId: 'p1', durationSec: 600 }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(interactions.record).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
```
Run: `pnpm --filter @nutri-plus/api test -- openai.provider` → FAIL.

- [ ] **Step 6: transcribeAudio (GREEN)** — em `apps/api/src/ai/openai.provider.ts`:
  - imports: adicionar `toFile` ao import do SDK → `import OpenAI, { toFile } from 'openai';`; adicionar `import { AIInteractionType } from '../generated/prisma/client';`; e no import de `./pricing` incluir `estimateTranscriptionCostUsd` → `import { estimateCostUsd, estimateTranscriptionCostUsd } from './pricing';`.
  - campo + construtor: adicionar `private readonly transcribeModel: string;` e, no construtor, `this.transcribeModel = config.getOrThrow<string>('OPENAI_MODEL_TRANSCRIBE');`.
  - método (adicionar ao final da classe):
```ts
  // Transcreve um áudio de consulta (Whisper). NUNCA registra o texto (PII):
  // o AIInteraction guarda só metadados (modelo, custo por duração, latência).
  async transcribeAudio(
    buffer: Buffer,
    filename: string,
    opts: { patientId?: string; durationSec?: number | null },
  ): Promise<string> {
    const model = this.transcribeModel;
    const startedAt = Date.now();
    const meta = { system: 'transcription', user: `audio ${opts.durationSec ?? '?'}s` };

    let text: string;
    try {
      const file = await toFile(buffer, filename);
      const result = await this.client.audio.transcriptions.create({ model, file, language: 'pt' });
      text = result.text;
    } catch {
      await this.interactions.record({
        type: AIInteractionType.CONSULTATION_TRANSCRIPTION,
        model,
        input: meta,
        latencyMs: Date.now() - startedAt,
        success: false,
        errorMessage: 'OpenAI transcription failed',
        patientId: opts.patientId,
      });
      this.logger.warn(`OpenAI transcription failed (model=${model})`);
      throw new BadGatewayException('AI provider unavailable');
    }

    const latencyMs = Date.now() - startedAt;
    await this.interactions.record({
      type: AIInteractionType.CONSULTATION_TRANSCRIPTION,
      model,
      input: meta,
      latencyMs,
      estimatedCostUsd: estimateTranscriptionCostUsd(model, opts.durationSec ?? undefined),
      success: true,
      patientId: opts.patientId,
    });
    this.logger.log(
      `Transcription ok (model=${model}, durationSec=${opts.durationSec ?? '?'}, latencyMs=${latencyMs})`,
    );
    return text;
  }
```
Run: `pnpm --filter @nutri-plus/api test -- openai.provider pricing` → PASS.

- [ ] **Step 7: Verificação + commit**

Run: `pnpm --filter @nutri-plus/api exec tsc --noEmit` (limpo).
```bash
git add apps/api/src/config/env.schema.ts apps/api/src/supabase/supabase-admin.service.ts apps/api/src/ai/pricing.ts apps/api/src/ai/pricing.spec.ts apps/api/src/ai/openai.provider.ts apps/api/src/ai/openai.provider.spec.ts
git commit -m "feat(api): Whisper transcription in OpenAIProvider + storage download

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: TranscriptionService (transcribe endpoint) — em AudiosService

**Files:** Modify `apps/api/src/patients/audios/audios.service.ts`, `apps/api/src/patients/audios/audios.controller.ts`, `apps/api/src/patients/audios/audios.module.ts`. Test: `apps/api/src/patients/audios/audios.service.spec.ts`.

**Interfaces:**
- Consumes: `SupabaseAdminService.downloadObject`, `OpenAIProvider.transcribeAudio` (T2); `AUDIO_BUCKET` (existente).
- Produces: `AudiosService.transcribe(ctx, patientId, audioId)` + rota `POST /v1/patients/:id/audios/:audioId/transcribe`; `toDto` expõe os campos de transcript.

> **Nota de decisão (desvio consciente do spec):** o spec propôs um `TranscriptionService` dedicado. Implementar a transcrição **dentro do `AudiosService`** reusa `requireOwnedPatient`, `toDto`, `AUDIO_BUCKET`, `prisma` e `admin` sem duplicá-los; transcrição é uma operação do domínio de áudio. Só é injetado o `OpenAIProvider` a mais.

- [ ] **Step 1: AudioRow + toDto (expor transcript)** — em `apps/api/src/patients/audios/audios.service.ts`:
  - imports: adicionar `import { OpenAIProvider } from '../../ai/openai.provider';` e `import type { TranscriptStatus } from '../../generated/prisma/client';`.
  - estender o `type AudioRow` com os 4 campos:
```ts
type AudioRow = {
  id: string; patientId: string; mimeType: string; durationSec: number | null;
  consentConfirmed: boolean; recordedAt: Date; storagePath: string;
  transcript: string | null; transcriptStatus: TranscriptStatus | null;
  transcribedAt: Date | null; transcriptError: string | null;
};
```
  (`toDto` já faz `{ storagePath, ...row }` + `signedUrl`, então os novos campos passam a ser expostos automaticamente e `storagePath` continua escondido — nenhuma mudança no corpo de `toDto`.)
  - construtor: injetar o provider:
```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: SupabaseAdminService,
    private readonly openai: OpenAIProvider,
  ) {}
```

- [ ] **Step 2: transcribe + runTranscription (RED)** — em `apps/api/src/patients/audios/audios.service.spec.ts`: adicionar o mock do provider e os testes. No `beforeEach`, trocar a construção do service para injetar o provider:
```ts
import { OpenAIProvider } from '../../ai/openai.provider';
// ...
let openai: DeepMockProxy<OpenAIProvider>;
// dentro do beforeEach:
openai = mockDeep<OpenAIProvider>();
service = new AudiosService(prisma, admin, openai);
```
Adicionar o bloco:
```ts
const audioRow = (over: Partial<any> = {}) => ({
  id: 'au1', patientId: 'p1', mimeType: 'audio/webm', durationSec: 12, consentConfirmed: true,
  recordedAt: new Date('2026-07-23'), storagePath: 'p1/au1.webm',
  transcript: null, transcriptStatus: null, transcribedAt: null, transcriptError: null, ...over,
});

describe('transcribe', () => {
  it('claims PROCESSING atomically and returns immediately (dto exposes status, hides storagePath)', async () => {
    prisma.consultationAudio.findFirst.mockResolvedValue(audioRow() as any);
    prisma.consultationAudio.updateMany.mockResolvedValue({ count: 1 } as any);
    prisma.consultationAudio.findUnique.mockResolvedValue(audioRow({ transcriptStatus: 'PROCESSING' }) as any);
    admin.downloadObject.mockResolvedValue(Buffer.from('x'));
    openai.transcribeAudio.mockResolvedValue('texto');
    prisma.consultationAudio.update.mockResolvedValue(audioRow() as any);

    const out: any = await service.transcribe(ctx, 'p1', 'au1');

    expect(prisma.consultationAudio.updateMany).toHaveBeenCalledWith({
      where: { id: 'au1', OR: [{ transcriptStatus: null }, { transcriptStatus: 'FAILED' }] },
      data: { transcriptStatus: 'PROCESSING', transcriptError: null },
    });
    expect(out.transcriptStatus).toBe('PROCESSING');
    expect(out.signedUrl).toBe('https://signed/x');
    expect(out.storagePath).toBeUndefined();
  });

  it('is idempotent: an already PROCESSING/DONE audio (claim count 0) does not reprocess', async () => {
    prisma.consultationAudio.findFirst.mockResolvedValue(audioRow({ transcriptStatus: 'DONE', transcript: 't' }) as any);
    prisma.consultationAudio.updateMany.mockResolvedValue({ count: 0 } as any);

    const out: any = await service.transcribe(ctx, 'p1', 'au1');

    expect(out.transcriptStatus).toBe('DONE');
    expect(admin.downloadObject).not.toHaveBeenCalled();
    expect(openai.transcribeAudio).not.toHaveBeenCalled();
  });

  it('404s when the patient is not owned', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);
    await expect(service.transcribe(ctx, 'pX', 'au1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the audio is not the patient’s', async () => {
    prisma.consultationAudio.findFirst.mockResolvedValue(null);
    await expect(service.transcribe(ctx, 'p1', 'auX')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('runTranscription (background)', () => {
  it('on success writes transcript + DONE + transcribedAt', async () => {
    admin.downloadObject.mockResolvedValue(Buffer.from('x'));
    openai.transcribeAudio.mockResolvedValue('olá');
    prisma.consultationAudio.update.mockResolvedValue({} as any);

    await (service as any).runTranscription('au1', 'p1', 'p1/au1.webm', 12);

    expect(prisma.consultationAudio.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'au1' },
        data: expect.objectContaining({ transcript: 'olá', transcriptStatus: 'DONE' }),
      }),
    );
  });

  it('on failure writes FAILED + error and never throws', async () => {
    admin.downloadObject.mockRejectedValue(new Error('boom'));
    prisma.consultationAudio.update.mockResolvedValue({} as any);

    await expect((service as any).runTranscription('au1', 'p1', 'p1/au1.webm', 12)).resolves.toBeUndefined();

    expect(prisma.consultationAudio.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ transcriptStatus: 'FAILED' }) }),
    );
  });
});
```
Run: `pnpm --filter @nutri-plus/api test -- audios.service` → FAIL.

- [ ] **Step 3: transcribe + runTranscription (GREEN)** — em `apps/api/src/patients/audios/audios.service.ts`, adicionar ao final da classe:
```ts
  async transcribe(ctx: AuthContext, patientId: string, audioId: string) {
    await this.requireOwnedPatient(ctx, patientId);
    const audio = await this.prisma.consultationAudio.findFirst({ where: { id: audioId, patientId } });
    if (!audio) throw new NotFoundException('Audio not found');

    // Reserva PROCESSING de forma atômica: só (re)começa de null ou FAILED.
    // Se já está PROCESSING/DONE, count===0 → devolve o atual sem reprocessar.
    // OR null-safe: `{ in: [null, ...] }` não casa linhas NULL em SQL.
    const claim = await this.prisma.consultationAudio.updateMany({
      where: { id: audioId, OR: [{ transcriptStatus: null }, { transcriptStatus: 'FAILED' }] },
      data: { transcriptStatus: 'PROCESSING', transcriptError: null },
    });
    if (claim.count === 0) {
      return this.toDto(audio as AudioRow);
    }

    // Fire-and-forget: o POST retorna agora; a transcrição segue em background.
    void this.runTranscription(audioId, patientId, audio.storagePath, audio.durationSec);

    const fresh = await this.prisma.consultationAudio.findUnique({ where: { id: audioId } });
    return this.toDto(fresh as AudioRow);
  }

  // Background: nunca lança (o request já respondeu). Falha vira FAILED.
  private async runTranscription(
    audioId: string,
    patientId: string,
    storagePath: string,
    durationSec: number | null,
  ): Promise<void> {
    try {
      const buffer = await this.admin.downloadObject(AUDIO_BUCKET, storagePath);
      const ext = storagePath.split('.').pop() ?? 'webm';
      const transcript = await this.openai.transcribeAudio(buffer, `audio.${ext}`, { patientId, durationSec });
      await this.prisma.consultationAudio.update({
        where: { id: audioId },
        data: { transcript, transcriptStatus: 'DONE', transcribedAt: new Date(), transcriptError: null },
      });
    } catch {
      await this.prisma.consultationAudio
        .update({
          where: { id: audioId },
          data: { transcriptStatus: 'FAILED', transcriptError: 'Não foi possível transcrever o áudio.' },
        })
        .catch(() => undefined);
      this.logger.warn(`Transcription failed (audioId=${audioId})`);
    }
  }
```
Adicionar `import { Logger } from '@nestjs/common';` (se ainda não importado) e o campo `private readonly logger = new Logger(AudiosService.name);` no topo da classe.
Run: `pnpm --filter @nutri-plus/api test -- audios.service` → PASS.

- [ ] **Step 4: rota + módulo** — em `apps/api/src/patients/audios/audios.controller.ts`, adicionar após `list`:
```ts
  @Post(':audioId/transcribe')
  transcribe(@CurrentUser() ctx: AuthContext, @Param('id') id: string, @Param('audioId') audioId: string) {
    return this.service.transcribe(ctx, id, audioId);
  }
```
Em `apps/api/src/patients/audios/audios.module.ts`, importar o `AiModule` para injetar o `OpenAIProvider`:
```ts
import { AiModule } from '../../ai/ai.module';
// ...
@Module({ imports: [SupabaseAdminModule, AiModule], controllers: [AudiosController], providers: [AudiosService] })
export class AudiosModule {}
```

- [ ] **Step 5: Verificação + commit**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit` (verde; tsc limpo — confirma a injeção do provider no módulo).
```bash
git add apps/api/src/patients/audios
git commit -m "feat(api): on-demand consultation transcription (POST .../transcribe)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Transcript no export LGPD (exportMyData)

**Files:** Modify `apps/api/src/patients/patients.service.ts`. Test: `apps/api/src/patients/patients.service.spec.ts`.

**Interfaces:** Consumes `MyDataExport.consultationTranscripts` (T1).

- [ ] **Step 1: Teste (RED)** — em `apps/api/src/patients/patients.service.spec.ts`, no `describe('exportMyData', ...)`, dentro do teste que monta o export, adicionar o mock e a asserção (mirar as linhas que fazem `prisma.mealPlan.findMany.mockResolvedValue(...)` / `prisma.foodRecall.findMany.mockResolvedValue(...)`):
```ts
    prisma.consultationAudio.findMany.mockResolvedValue([
      { recordedAt: new Date('2026-07-20'), durationSec: 600, transcript: 'olá', transcribedAt: new Date('2026-07-21') },
    ] as any);
```
E, após o `await service.exportMyData(...)`, adicionar:
```ts
    expect(out.consultationTranscripts).toEqual([
      expect.objectContaining({ transcript: 'olá', durationSec: 600 }),
    ]);
    expect(prisma.consultationAudio.findMany).toHaveBeenCalledWith({
      where: { patientId: 'pp-1', transcriptStatus: 'DONE' },
      orderBy: { recordedAt: 'asc' },
      select: { recordedAt: true, durationSec: true, transcript: true, transcribedAt: true },
    });
```
(Ajustar `'pp-1'` para o `patientId` que o teste existente usa em `exportMyData`.)
Run: `pnpm --filter @nutri-plus/api test -- patients.service` → FAIL.

- [ ] **Step 2: Implementar (GREEN)** — em `apps/api/src/patients/patients.service.ts`, `exportMyData`: adicionar a query ao `Promise.all` (e o nome ao destructure) e o campo ao objeto de retorno. A query:
```ts
        this.prisma.consultationAudio.findMany({
          where: { patientId, transcriptStatus: 'DONE' },
          orderBy: { recordedAt: 'asc' },
          select: { recordedAt: true, durationSec: true, transcript: true, transcribedAt: true },
        }),
```
Adicionar `consultationTranscripts` como o último nome no array de destructure do `Promise.all` (na mesma ordem em que a query foi inserida) e `consultationTranscripts,` ao objeto retornado (após `consents,`).
Run: `pnpm --filter @nutri-plus/api test -- patients.service` → PASS.

- [ ] **Step 3: Verificação + commit**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit` (verde).
```bash
git add apps/api/src/patients/patients.service.ts apps/api/src/patients/patients.service.spec.ts
git commit -m "feat(api): include consultation transcripts in LGPD data export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Web — botão Transcrever + status + poll

**Files:** Modify `apps/web/src/lib/api/consultation-audio.ts`, `apps/web/src/lib/queries/consultation-audio.ts`, `apps/web/src/components/patients/consultation-audio-section.tsx`. Test: `apps/web/src/components/patients/consultation-audio-section.test.tsx`.

**Interfaces:** Consumes `ConsultationAudio.transcript*` (T1) + `POST .../transcribe` (T3).

- [ ] **Step 1: api client** — em `apps/web/src/lib/api/consultation-audio.ts`, adicionar:
```ts
export function transcribeAudio(patientId: string, audioId: string): Promise<ConsultationAudio> {
  return browserApiFetch<ConsultationAudio>(`/patients/${patientId}/audios/${audioId}/transcribe`, {
    method: 'POST',
  });
}
```

- [ ] **Step 2: queries (poll + mutation)** — em `apps/web/src/lib/queries/consultation-audio.ts`:
  - importar `transcribeAudio` no import existente de `@/lib/api/consultation-audio`.
  - trocar `useAudios` por (poll só enquanto houver PROCESSING):
```ts
export function useAudios(patientId: string) {
  return useQuery({
    queryKey: ['audios', patientId],
    queryFn: () => listAudios(patientId),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((a) => a.transcriptStatus === 'PROCESSING') ? 4000 : false,
  });
}
```
  - adicionar:
```ts
export function useTranscribeAudio(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (audioId: string) => transcribeAudio(patientId, audioId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audios', patientId] }),
  });
}
```

- [ ] **Step 3: UI test (RED)** — em `apps/web/src/components/patients/consultation-audio-section.test.tsx`: adicionar `useTranscribeAudio` ao `vi.mock('@/lib/queries/consultation-audio', ...)` (retornando `{ mutate, isPending: false }`) e os testes:
```ts
  it('shows a "Transcrever" button when the audio has no transcript status', () => {
    useAudiosMock.mockReturnValue({ data: [audio({ transcriptStatus: null })], isLoading: false });
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    expect(screen.getByRole('button', { name: /transcrever/i })).toBeInTheDocument();
  });

  it('shows "Transcrevendo…" while PROCESSING', () => {
    useAudiosMock.mockReturnValue({ data: [audio({ transcriptStatus: 'PROCESSING' })], isLoading: false });
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    expect(screen.getByText(/transcrevendo/i)).toBeInTheDocument();
  });

  it('renders the transcript text when DONE', () => {
    useAudiosMock.mockReturnValue({
      data: [audio({ transcriptStatus: 'DONE', transcript: 'paciente relatou dor' })], isLoading: false,
    });
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    expect(screen.getByText('paciente relatou dor')).toBeInTheDocument();
  });

  it('offers "Tentar de novo" when FAILED and triggers the mutation', async () => {
    useAudiosMock.mockReturnValue({ data: [audio({ transcriptStatus: 'FAILED' })], isLoading: false });
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(transcribeMock).toHaveBeenCalledWith('a1');
  });
```
No topo do arquivo de teste, adicionar `const transcribeMock = vi.fn();` e no mock do módulo: `useTranscribeAudio: () => ({ mutate: transcribeMock, isPending: false })`; resetar `transcribeMock` no `beforeEach`. (A fixture `audio()` já inclui os novos campos porque o tipo `ConsultationAudio` foi estendido no T1; garantir que `audio()` retorne `transcript: null, transcriptStatus: null, transcribedAt: null, transcriptError: null` por padrão.)
Run: `pnpm --filter @nutri-plus/web test -- consultation-audio-section` → FAIL.

- [ ] **Step 4: UI (GREEN)** — em `apps/web/src/components/patients/consultation-audio-section.tsx`:
  - import: `import { useAudios, useDeleteAudio, useTranscribeAudio, useUploadAudio } from '@/lib/queries/consultation-audio';`
  - no componente: `const transcribe = useTranscribeAudio(patientId);`
  - trocar o `<li>` de cada áudio por uma coluna (linha existente + bloco de transcript embaixo):
```tsx
            <li key={a.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground">{fmtDate(a.recordedAt)}</span>
                <audio controls src={a.signedUrl} className="min-w-0 flex-1" />
                {canEdit && (
                  confirmingId === a.id ? (
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Excluir?</span>
                      <Button type="button" variant="outline" size="sm" className="rounded-full"
                        onClick={() => setConfirmingId(null)} disabled={deletingId === a.id}>Cancelar</Button>
                      <Button type="button" size="sm" className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => handleDelete(a.id)} disabled={deletingId === a.id} aria-label="Confirmar exclusão da gravação">
                        {deletingId === a.id ? 'Excluindo…' : 'Excluir'}
                      </Button>
                    </span>
                  ) : (
                    <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive"
                      onClick={() => setConfirmingId(a.id)} aria-label="Excluir gravação">Excluir</Button>
                  )
                )}
              </div>

              {a.transcriptStatus === 'PROCESSING' && (
                <p className="text-sm text-muted-foreground">Transcrevendo…</p>
              )}
              {a.transcriptStatus === 'DONE' && a.transcript && (
                <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">
                  {a.transcript}
                </div>
              )}
              {a.transcriptStatus === 'FAILED' && (
                <p className="text-sm text-destructive">
                  Falha na transcrição.{' '}
                  {canEdit && (
                    <button type="button" className="font-semibold underline" onClick={() => transcribe.mutate(a.id)}>
                      Tentar de novo
                    </button>
                  )}
                </p>
              )}
              {canEdit && a.transcriptStatus == null && (
                <Button type="button" variant="outline" size="sm" className="w-fit rounded-full"
                  onClick={() => transcribe.mutate(a.id)} disabled={transcribe.isPending}>
                  Transcrever
                </Button>
              )}
            </li>
```
Run: `pnpm --filter @nutri-plus/web test -- consultation-audio-section` → PASS.

- [ ] **Step 5: Verificação de todas as áreas + commit**

Run:
```
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```
Expected: tudo verde (mobile tsc confirma que os campos novos do shared-type não quebram — aditivo).
```bash
git add apps/web/src/lib/api/consultation-audio.ts apps/web/src/lib/queries/consultation-audio.ts apps/web/src/components/patients/consultation-audio-section.tsx apps/web/src/components/patients/consultation-audio-section.test.tsx
git commit -m "feat(web): transcribe consultation audio (button + status + poll)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificação final

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```

Manual (dev DB + um paciente com uma gravação de consulta): aba **Anamnese** → uma gravação → **"Transcrever"** → aparece "Transcrevendo…" e a lista faz poll → vira o texto do transcript (ou "Falha na transcrição." + "Tentar de novo"). Confirmar que o paciente/mobile não mudou e que a exclusão de conta continua removendo tudo.

## Notas

- **Sem fila:** se a API reiniciar com um áudio em `PROCESSING`, o status fica preso — o nutri clica "Transcrever" de novo (o claim atômico só reprocessa de `FAILED`/null, então um `PROCESSING` preso precisaria virar `FAILED`; aceitável no MVP, documentado como limitação; um "destravar" manual fica para depois se incomodar).
- **Custo:** cada transcrição fica auditável no `AIInteraction` (custo por duração). Limite rígido por plano fora do escopo (v2a).
- **v2b** (rascunho de anamnese a partir do transcript) é o próximo sub-projeto.
