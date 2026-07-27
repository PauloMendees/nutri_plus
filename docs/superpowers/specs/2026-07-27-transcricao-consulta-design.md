# Transcrição da Consulta (v2a) — Design

**Date:** 2026-07-27
**Branch:** `feat/transcricao-consulta` (off main 171cc70; F, B, A/TACO, C/LGPD, D1/anamnese+áudio, D2/recordatório todos mergeados)
**Status:** Approved design — ready for implementation plan

**Sub-projeto Transcrição (v2), fase v2a.** Transcrever, **sob demanda**, o áudio de consulta já gravado (D1) via **Whisper (OpenAI)**, processando em **background** (sem fila dedicada), e exibir o texto na aba Anamnese. Ferramenta **clínica do nutricionista** — o transcript **não** é exposto ao paciente/mobile. O **v2b** (LLM gera um rascunho de anamnese a partir do transcript, sempre revisado, nunca auto-salvo) fica como sub-projeto seguinte.

## Decisões (do brainstorming)

- **Gatilho: sob demanda.** O nutricionista clica "Transcrever" no áudio quando quiser — só gasta Whisper quando ele decide (controla custo; evita transcrever gravações de teste/descartadas). Whisper ≈ US$0,006/min (consulta de ~40 min ≈ US$0,24).
- **Processamento: background + status.** O `POST .../transcribe` retorna na hora marcando `PROCESSING`; o Nest processa em background (não-awaited); a web faz poll até `DONE`/`FAILED`. Sem fila nova, sem dependência nova. Se a API reiniciar no meio, o nutri clica de novo (retry manual).
- **Sem opções pesadas de infra** — não há fila/cron/background no projeto hoje, e não se introduz (BullMQ/Redis fora de escopo).
- **LGPD:** o transcript **entra no `exportMyData`** (paridade de acesso, como a anamnese no D1). Erasure já resolvido por cascade.
- **Escopo enxuto:** v2a só o transcript. v2b (rascunho de anamnese) é sub-projeto à parte.

## Estado atual (o que reusar — não reinventar)

- **Áudio de consulta (D1):** `ConsultationAudio` (bucket privado `consultation-audio`, `storagePath`, `mimeType`, `durationSec`, `consentConfirmed`, `recordedAt`) + `AudiosService` (ownership→404 via `resolveScopeNutritionistId`, `toDto` que troca `storagePath` por `signedUrl`, list/delete scoped) + controller `patients/:id/audios` + `ConsultationAudioSection` (grava via MediaRecorder, lista com `<audio src=signedUrl>`, dentro da aba **Anamnese**) + shared-types `v1/consultation-audio.ts`.
- **OpenAI (infra existente):** `OpenAIProvider` (`apps/api/src/ai/openai.provider.ts`) é *"o único gateway pro SDK — nada mais importa `openai`"*. Constrói `new OpenAI({ apiKey })`, modelos via `OPENAI_MODEL_SMART`/`FAST`. `generateStructured` já registra cada chamada no `AiInteractionsService.record` (grava `AIInteraction` com `type`, `model`, tokens, `estimatedCostUsd`, `latencyMs`, `success`, `patientId` — **nunca** o conteúdo de prompt/response, que é PII). `pricing.ts` tem `estimateCostUsd`. SDK `openai@^6.42.0` já é dependência.
- **Storage:** `SupabaseAdminService` tem `uploadObject`/`removeObject`/`createSignedUrl`, mas **não tem download** — será adicionado.
- **Padrões:** `resolveScopeNutritionistId(ctx)` + ownership→404; `@Roles(UserRole.NUTRITIONIST)`; abas do `patient-detail`; react-query + a query de áudios já existente.

## Modelo de dados (migração aditiva)

Campos novos no `ConsultationAudio` (1:1 com o áudio; sem tabela nova):
```prisma
enum TranscriptStatus {
  PROCESSING
  DONE
  FAILED
}

model ConsultationAudio {
  // ...campos existentes...
  transcript       String?
  transcriptStatus TranscriptStatus?   // null = nunca transcrito
  transcribedAt    DateTime?
  transcriptError  String?
}
```
Novo valor no enum de tracking de IA: `AIInteractionType += CONSULTATION_TRANSCRIPTION` (aditivo).

shared-types (`v1/consultation-audio.ts`): estender `ConsultationAudio` com `transcript: string | null`, `transcriptStatus: TranscriptStatus | null`, `transcribedAt: string | null`, `transcriptError: string | null`; exportar o union `type TranscriptStatus = 'PROCESSING' | 'DONE' | 'FAILED'`.

## API

Módulo de áudios existente (`apps/api/src/patients/audios/*`), nutricionista-only, ownership→404.

- **`POST /v1/patients/:id/audios/:audioId/transcribe`** — dispara a transcrição sob demanda:
  - valida posse do paciente **e** do áudio → 404 se não for dele;
  - **marca `PROCESSING` atomicamente**: `updateMany({ where: { id: audioId, transcriptStatus: { in: [null, 'FAILED'] } }, data: { transcriptStatus: 'PROCESSING', transcriptError: null } })`. Se `count === 0`, já está `PROCESSING` ou `DONE` → retorna o registro atual **sem** reprocessar (idempotente; evita duplo-clique e regravação);
  - **retorna imediatamente** o DTO do áudio (status `PROCESSING`);
  - **em background** (não-awaited, isolado num método que nunca lança pro request): baixa o objeto → Whisper → grava resultado. Sucesso: `transcript`, `transcriptStatus = DONE`, `transcribedAt = now`. Erro: `transcriptStatus = FAILED`, `transcriptError` (mensagem curta, truncada). O background usa `SupabaseAdminService.downloadObject` + `OpenAIProvider.transcribeAudio`.
- **`GET /v1/patients/:id/audios`** (lista já existente) passa a incluir os campos de transcript no DTO. A web faz poll dessa lista enquanto houver `PROCESSING`.

`AudiosService.toDto` passa a expor `transcript`/`transcriptStatus`/`transcribedAt`/`transcriptError` (continua escondendo `storagePath`). A lógica de transcrição (download + Whisper + update, incluindo o método background) vive numa unidade dedicada `TranscriptionService` no mesmo módulo (responsabilidade única), injetando `PrismaService`, `SupabaseAdminService` e `OpenAIProvider`; o controller chama `transcription.transcribe(ctx, patientId, audioId)`.

**`SupabaseAdminService.downloadObject(bucket, path): Promise<Buffer>`** (novo) — `storage.from(bucket).download(path)` → `Buffer.from(await blob.arrayBuffer())`; lança em erro (o background captura e marca `FAILED`).

**`OpenAIProvider.transcribeAudio(buffer, filename, opts?): Promise<string>`** (novo método no gateway):
- `const file = await toFile(buffer, filename)` (helper do SDK);
- `this.client.audio.transcriptions.create({ model: this.models.transcribe, file, language: 'pt' })` → `{ text }`;
- registra no `AiInteractionsService.record` com `type: CONSULTATION_TRANSCRIPTION`, `model`, `estimatedCostUsd` (via `durationSec`, quando disponível), `latencyMs`, `success`, `patientId` — **sem** gravar o texto (PII); em falha, registra `success:false` e lança `BadGatewayException` (o `TranscriptionService` captura e marca `FAILED`).
- Modelo via env **`OPENAI_MODEL_TRANSCRIBE`** adicionado ao `env.schema` com **default `'whisper-1'`** (não exige mexer no `.env`). `pricing.ts` ganha o custo por-minuto do Whisper (`0.006/min`) para `estimatedCostUsd` das transcrições.

## Web

Dentro do `ConsultationAudioSection` (aba Anamnese), abaixo de cada player:
- **sem status** (`transcriptStatus == null`) → botão **"Transcrever"** (`useTranscribeAudio` → `POST .../transcribe`, invalida/atualiza a lista);
- **`PROCESSING`** → "Transcrevendo…" (spinner, botão desabilitado);
- **`DONE`** → o texto do transcript num box com scroll (`max-height` + `overflow`);
- **`FAILED`** → aviso curto + **"Tentar de novo"** (dispara `transcribe` de novo).

A query de áudios (`useConsultationAudios`) ganha um **`refetchInterval`** ativo apenas enquanto **algum** áudio da lista estiver `PROCESSING` (poll ~4s; desliga quando nenhum está processando). `!canEdit` → só leitura (mostra transcript se houver, sem botão Transcrever). Paciente/mobile inalterados.

## LGPD

`exportMyData` (acesso do titular) passa a incluir os transcripts do paciente — nova coleção **`consultationTranscripts`** = para cada `ConsultationAudio` com `transcriptStatus = DONE`: `{ recordedAt, durationSec, transcript, transcribedAt }` (só o texto derivado, não o arquivo de áudio). `MyDataExport` (shared-types) ganha o campo `consultationTranscripts`. Erasure: já coberto — `ConsultationAudio` é `onDelete: Cascade` a partir do `PatientProfile`, então transcripts somem na exclusão de conta (sem mudança).

## Testes

- **API (jest):**
  - `transcribe` marca `PROCESSING` e retorna na hora; dispara o background (mockar `TranscriptionService`/provider/download).
  - background sucesso → `transcript` + `DONE` + `transcribedAt`; erro (download ou Whisper) → `FAILED` + `transcriptError`, sem lançar.
  - idempotência: áudio `DONE` não reprocessa (retorna atual); `FAILED`/null reprocessa.
  - ownership → 404 (paciente e áudio não-possuídos).
  - `toDto` expõe os campos de transcript e continua escondendo `storagePath`.
  - `OpenAIProvider.transcribeAudio` unit (mock `client.audio.transcriptions.create` + `toFile`); registra a interação (type CONSULTATION_TRANSCRIPTION, sem texto), custo estimado.
  - `SupabaseAdminService.downloadObject` unit (mock do storage).
  - `exportMyData` inclui `consultationTranscripts` (só os `DONE`), sem vazar de outro paciente.
- **Web (vitest):** botão "Transcrever" quando sem status; `PROCESSING` mostra spinner + a lista faz poll; `DONE` mostra o texto; `FAILED` mostra "Tentar de novo".
- **shared-types:** build limpo.

## Restrições

- Migração **aditiva** (enum `TranscriptStatus` + 4 colunas no `ConsultationAudio` + valor de enum `CONSULTATION_TRANSCRIPTION`). shared-types reconstruído. **Sem novas dependências** (usa o `openai` já instalado, via `OpenAIProvider`). pt-BR.
- **Nutricionista-only**; paciente/mobile inalterado. `@Roles(NUTRITIONIST)` + ownership (paciente **e** áudio) → 404, `resolveScopeNutritionistId`.
- **Nada além do `OpenAIProvider` importa o SDK `openai`** — o Whisper entra como método do provider.
- Whisper sob demanda (sem transcrição automática). Sem limite rígido por plano no v2a (YAGNI — não há tiers de plano ainda); custo fica auditável via `AIInteraction`.
- Reusar: áudio D1 (`ConsultationAudio`/`AudiosService`/`ConsultationAudioSection`), o `OpenAIProvider` + `AiInteractionsService` + `pricing`, `resolveScopeNutritionistId` + ownership→404, abas/seção do `patient-detail`, react-query.
- Aspas: api simples; web por arquivo. Testes API JEST / web vitest. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** push/PR sem pedir. Branch `feat/transcricao-consulta`. Verificar por área: shared-types build; API test+tsc; web test+tsc; mobile tsc (aditivo, sem ripple esperado).

## Mapa de arquivos

- `apps/api/prisma/schema.prisma` (+ enum `TranscriptStatus` + 4 colunas em `ConsultationAudio` + `AIInteractionType.CONSULTATION_TRANSCRIPTION`) + migração
- `packages/shared-types/src/v1/consultation-audio.ts` (+ campos de transcript + `TranscriptStatus`) + `v1/data-export.ts` (+ `consultationTranscripts`)
- `apps/api/src/supabase/supabase-admin.service.ts` (+ `downloadObject`)
- `apps/api/src/ai/openai.provider.ts` (+ `transcribeAudio`) + `ai/pricing.ts` (+ custo Whisper) + `config/env.schema.ts` (+ `OPENAI_MODEL_TRANSCRIBE` default `whisper-1`)
- `apps/api/src/patients/audios/**` (novo `transcription.service.ts` + rota `POST :audioId/transcribe` no controller + `toDto`/DTO com transcript + module wiring) + specs
- `apps/api/src/patients/patients.service.ts` (`exportMyData` + `consultationTranscripts`) + spec
- `apps/web/src/lib/api/consultation-audio.ts` + `lib/queries/consultation-audio.ts` (+ `useTranscribeAudio` + poll) + `components/patients/consultation-audio-section.tsx` (+ UI de transcript) (+ tests)
