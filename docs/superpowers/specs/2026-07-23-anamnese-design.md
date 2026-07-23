# Anamnese + Gravação de Consulta (D1) — Design

**Date:** 2026-07-23
**Branch:** `feat/anamnese` (off main; F, B, A/TACO, C/LGPD todos mergeados) — **um PR** cobre as duas partes
**Status:** Approved design — ready for implementation plan

**Sub-projeto D1** (D = "anamnese + recordatório 24h", decomposto; **D2 recordatório 24h** fica para depois). Por decisão do usuário, D1 entrega DUAS features no mesmo PR:
1. **Anamnese nutricional estruturada** — o nutricionista preenche no detalhe do paciente (web).
2. **Gravação de consulta (v1)** — o nutricionista grava o áudio da consulta (web), com consentimento; um histórico de áudios por paciente, armazenamento privado. **IA (transcrição → auto-rascunho) fica para uma v2 futura**, fora deste PR.

## Decisões (do brainstorming)

**Anamnese:** campos estruturados fixos (não template customizável); nutricionista-only (web); **1 registro por paciente** (`PatientAnamnese` 1:1, upsert), estendendo os campos clínicos já no `PatientProfile` sem duplicá-los.

**Gravação de consulta (v1):** gravar + armazenar + listar/tocar + excluir; **IA adiada**. Captura no navegador (`MediaRecorder`); **atestado de consentimento por gravação** (checkbox obrigatório, gravado no registro) — mais simples e adequado que amarrar no consentimento de dados do C1; **storage PRIVADO** (áudio de voz é dado sensível) com **URL assinada** de curta duração para reprodução; a **exclusão de conta (C2) passa a remover também os áudios do storage** (best-effort).

## Estado atual (o que reusar / não duplicar)

- `PatientProfile` já tem `medicalConditions`, `restrictions`, `allergies`, `activityLevel`, `objective`, `notes`, `birthDate`, `gender`, `height` — a anamnese **complementa**, sem repetir.
- Detalhe do paciente (`patient-detail.tsx`) usa `<Tabs>`: **Dados / Bioimpedância / Metas / Planos / Silhueta**, cada aba um `Section` (`patientId`/`canEdit`) com `lib/api` + `lib/queries` próprios. Anamnese e Gravações entram como novas abas.
- Sub-recurso patient-scoped no API: `nutrition-targets` (`/v1/patients/:id/nutrition-targets`, `@Roles(NUTRITIONIST)`, ownership → 404, `resolveScopeNutritionistId`) — padrão para os dois.
- Upload multipart: `patients.service.uploadPhoto` + o endpoint com `FileInterceptor` (upload de foto) — padrão para o upload de áudio.
- `SupabaseAdminService`: já tem `uploadPublicObject` + `removeObject` — adicionar upload privado + `createSignedUrl`.
- Erasure: `deleteMyAccount` (C2) já lê a `photoUrl` e remove o objeto best-effort — mesmo padrão para os áudios.

---

## Parte 1 — Anamnese

### Modelo de dados (migração aditiva)

`PatientAnamnese` — 1:1 (`patientId @unique`), `onDelete: Cascade` (a exclusão do C2 cuida via cascade — sem novo teardown). Campos **todos opcionais**:
```prisma
model PatientAnamnese {
  id                 String   @id @default(uuid())
  patientId          String   @unique
  patient            PatientProfile @relation(fields: [patientId], references: [id], onDelete: Cascade)
  // Clínico
  mainComplaint      String?
  medications        String?
  familyHistory      String?
  supplements        String?
  // Hábitos de vida
  sleepHoursPerNight Float?
  waterIntakeLiters  Float?
  alcoholUse         String?
  smoking            String?
  physicalActivity   String?
  // Digestivo
  bowelHabit         String?
  // Alimentar
  mealsPerDay        Int?
  eatingHabits       String?
  foodPreferences    String?
  // Geral
  clinicalNotes      String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```
`PatientProfile += anamnese PatientAnamnese?`.

shared-types (`v1/anamnese.ts`): `PatientAnamnese` (datas ISO) + `UpsertAnamneseRequest` (os campos acima, opcionais; sem id/patientId/datas). Exportado do index.

### API

- **`GET /v1/patients/:id/anamnese`** `@Roles(NUTRITIONIST)`: a anamnese do paciente (ownership → 404) ou `null`.
- **`PUT /v1/patients/:id/anamnese`** `@Roles(NUTRITIONIST)` (body `UpdatePatientAnamneseDto`, todos `@IsOptional`; números ≥ 0, textos com `MaxLength`): **upsert** por `patientId` (`prisma.patientAnamnese.upsert`) após checar a posse. Retorna o registro.

### Web

- `lib/api/anamnese.ts` (`getAnamnese`/`upsertAnamnese`) + `lib/queries/anamnese.ts` (`useAnamnese`/`useUpsertAnamnese`) + `lib/validation/anamnese.ts` (zod).
- `components/patients/anamnese-section.tsx` (`{ patientId, canEdit }`): form (react-hook-form + zod, mirando `bioimpedance-section`) com os campos em cards **Clínico / Hábitos de vida / Digestivo / Alimentar / Geral**; maioria `Textarea`, numéricos `Input type=number`; **"Salvar"** → upsert; `!canEdit` → `<fieldset disabled>` sem botão.
- Aba **"Anamnese"** no `patient-detail.tsx` logo após "Dados".

---

## Parte 2 — Gravação de consulta (v1)

### Modelo de dados (migração aditiva)

`ConsultationAudio` — histórico (N por paciente), `onDelete: Cascade`:
```prisma
model ConsultationAudio {
  id               String   @id @default(uuid())
  patientId        String
  patient          PatientProfile @relation(fields: [patientId], references: [id], onDelete: Cascade)
  storagePath      String   // caminho no bucket privado consultation-audio
  mimeType         String
  durationSec      Int?
  consentConfirmed Boolean  // o nutri atestou que o paciente consentiu com ESTA gravação
  recordedAt       DateTime @default(now())
  createdAt        DateTime @default(now())
  @@index([patientId, recordedAt])
}
```
`PatientProfile += consultationAudios ConsultationAudio[]`.

shared-types (`v1/consultation-audio.ts`): `ConsultationAudio { id, patientId, durationSec: number | null, consentConfirmed, recordedAt, mimeType, signedUrl: string }` (o `signedUrl` é preenchido na leitura; `storagePath` NÃO é exposto no fio). Exportado do index.

### Storage (privado)

- Bucket **`consultation-audio` PRIVADO** no Supabase (pré-requisito de ops, como `patient-photos` — criado no dashboard; não é uma migração de DB). Path: `${patientId}/${audioId}.${ext}`.
- `SupabaseAdminService` += `uploadObject(bucket, path, buffer, contentType)` (upload sem URL pública) + `createSignedUrl(bucket, path, expiresInSec)` (retorna URL assinada de curta duração). Reproduzir sempre via URL assinada; nunca URL pública.

### API (`patients/:id/audios`, `@Roles(NUTRITIONIST)`, ownership → 404)

- **`POST /v1/patients/:id/audios`** (multipart, `FileInterceptor('file')` como o upload de foto): campos `consentConfirmed` (deve ser `true`, senão **400** — não grava sem consentimento) + `durationSec?`. Valida o mimetype de áudio; sobe o blob pro bucket privado via `uploadObject`; cria o `ConsultationAudio`. Retorna o registro (com `signedUrl`).
- **`GET /v1/patients/:id/audios`** → lista (recordedAt desc), cada item com uma **URL assinada** de reprodução (`createSignedUrl`).
- **`DELETE /v1/patients/:id/audios/:audioId`** → apaga o objeto do storage (`removeObject`) + a linha. Ownership do áudio (pertence ao paciente possuído) → 404.

### Erasure (LGPD) — estender o C2

`deleteMyAccount` (`patients.service.ts`): antes da transação, ler os `storagePath` dos `consultationAudio` do paciente; depois da transação (as linhas caem por Cascade), remover cada objeto do bucket `consultation-audio` **best-effort** (mesmo try/catch da foto de perfil). Assim a erasure não deixa áudio órfão.

### Web

- `lib/api/consultation-audio.ts` (`listAudios`/`uploadAudio`(multipart)/`deleteAudio`) + `lib/queries/consultation-audio.ts` (`useAudios`/`useUploadAudio`/`useDeleteAudio`, key `['audios', patientId]`).
- `components/patients/consultation-audio-section.tsx` (`{ patientId, canEdit }`):
  - **Gravador** (só `canEdit`): checkbox obrigatório "O paciente consentiu com a gravação desta consulta" → habilita **Gravar** (`MediaRecorder` via `navigator.mediaDevices.getUserMedia({ audio: true })`); Gravar/Parar; ao parar, envia o blob + `consentConfirmed` + `durationSec` via `useUploadAudio`. Trata permissão de microfone negada.
  - **Lista/histórico:** cada gravação com data, duração, um `<audio controls src={signedUrl}>` e (se `canEdit`) excluir (confirmação).
- Aba **"Gravações"** no `patient-detail.tsx` (ao lado de "Anamnese").

## Testes

- **API (jest):** anamnese — `PUT` cria e depois atualiza o mesmo 1:1; `GET` retorna ou null; não-possuído → 404; validação. Áudio — `POST` sem `consentConfirmed` → 400 (não sobe nada); `POST` sobe pro bucket + cria a linha; `GET` retorna a lista com URL assinada (mockar `createSignedUrl`); `DELETE` remove objeto + linha; ownership → 404; `deleteMyAccount` também remove os objetos de áudio (best-effort). Mockar `SupabaseAdminService` (upload/signedUrl/remove).
- **Web (vitest):** `AnamneseSection` (render, salvar chama upsert, `!canEdit` desabilita). `ConsultationAudioSection` (o checkbox de consentimento gate­ia o Gravar; a lista renderiza um player por áudio; excluir chama a mutation; `!canEdit` esconde gravador/excluir) — mockar `MediaRecorder`/`getUserMedia` + as queries. Ambas as abas aparecem no `patient-detail`.
- **shared-types:** `build` limpo. Mobile inalterado (rodar tsc só se ripple).

## Restrições

- Migração **aditiva** (2 tabelas + back-relations; ambas `onDelete: Cascade`). shared-types reconstruído. **Sem novas dependências** (`MediaRecorder`/`getUserMedia` são web nativos; upload multipart e Supabase storage já usados). pt-BR.
- **Nutricionista-only (web)**; paciente/mobile inalterado. `@Roles(NUTRITIONIST)` + ownership (→ 404), `resolveScopeNutritionistId`.
- Áudio de consulta = **dado sensível**: bucket **privado**, reprodução só por URL assinada, gravação exige consentimento atestado, erasure remove os objetos. Não gravar sem `consentConfirmed`.
- Pré-requisito de ops: criar o bucket privado `consultation-audio` no Supabase (como `patient-photos`).
- Reusar padrões existentes (seções do detalhe, react-hook-form + zod, sub-recurso patient-scoped, `FileInterceptor`/upload, `SupabaseAdminService`). Combinar estilos de aspas (api aspas simples; web por arquivo). Testes API JEST / web vitest. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** dar push/PR sem pedir. Branch `feat/anamnese`. Verificar por área: shared-types build; API test+tsc; web test+tsc.

## Mapa de arquivos

- `apps/api/prisma/schema.prisma` (+ `PatientAnamnese`, `ConsultationAudio` + back-relations) + migração
- `packages/shared-types/src/v1/anamnese.ts` + `v1/consultation-audio.ts` (novos) + `v1/index.ts`
- `apps/api/src/patients/anamnese/**` (anamnese: module/controller/service/DTO/specs) + `apps/api/src/patients/audios/**` (áudio: module/controller/service/DTO/specs)
- `apps/api/src/supabase/supabase-admin.service.ts` (+ `uploadObject` + `createSignedUrl`) + `apps/api/src/patients/patients.service.ts` (`deleteMyAccount` remove os áudios) + spec
- `apps/web/src/lib/api/{anamnese,consultation-audio}.ts` + `lib/queries/{anamnese,consultation-audio}.ts` + `lib/validation/anamnese.ts` + `components/patients/{anamnese-section,consultation-audio-section}.tsx` (+ tests) + `patient-detail.tsx` (2 abas)
