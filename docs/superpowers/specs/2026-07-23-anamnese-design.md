# Anamnese (D1) — Design

**Date:** 2026-07-23
**Branch:** `feat/anamnese` (off main; F, B, A/TACO, C/LGPD todos mergeados)
**Status:** Approved design — ready for implementation plan

**Sub-projeto D1** do batch de 6 (D = "anamnese + recordatório 24h", decomposto em **D1 anamnese** + **D2 recordatório 24h**). D1: uma **anamnese nutricional estruturada** que o nutricionista preenche no detalhe do paciente (web). D2 (recordatório 24h — refeições/alimentos reais reusando o `FoodSearch`/`macrosForPortion` do A) fica para depois.

## Decisões (do brainstorming)

- **Campos estruturados fixos** (um conjunto definido da anamnese nutricional) — não um construtor de template customizável.
- **Nutricionista no web** preenche (como bioimpedância/metas/planos); o paciente não mexe.
- **1 registro por paciente** (`PatientAnamnese` 1:1, upsert), estendendo os campos clínicos já existentes no `PatientProfile` **sem duplicá-los**.
- Segue o padrão das seções do detalhe do paciente: aba + `Section` (`patientId`/`canEdit`) + react-hook-form + zod + camada de API própria.

## Estado atual (o que já existe — não duplicar)

- `PatientProfile` já tem campos clínicos: `medicalConditions`, `restrictions`, `allergies`, `activityLevel`, `objective`, `notes`, `birthDate`, `gender`, `height`. A anamnese **complementa** com o resto (medicamentos, histórico familiar, sono, água, etc.), sem repetir esses.
- O detalhe do paciente (`apps/web/src/components/patients/patient-detail.tsx`) usa `<Tabs>`: **Dados / Bioimpedância / Metas / Planos alimentares / Silhueta**, cada aba um `Section` (`bioimpedance-section`, `nutrition-targets-section`, `meal-plans-section`, `silhueta-section`) com `patientId` + `canEdit` e sua própria `lib/api` + `lib/queries`.
- Padrão de sub-recurso patient-scoped no API: `nutrition-targets` (`POST/GET /v1/patients/:id/nutrition-targets`, `@Roles(NUTRITIONIST)`, ownership → 404, `resolveScopeNutritionistId`).

## Modelo de dados (migração aditiva)

`PatientAnamnese` — 1:1 com o paciente, `onDelete: Cascade` (a exclusão de conta do C2 já cuida via cascade — nenhum teardown novo). Campos **todos opcionais** (preenchimento progressivo):
```prisma
model PatientAnamnese {
  id                 String   @id @default(uuid())
  patientId          String   @unique
  patient            PatientProfile @relation(fields: [patientId], references: [id], onDelete: Cascade)

  // Clínico
  mainComplaint      String?   // queixa principal
  medications        String?   // medicamentos em uso
  familyHistory      String?   // histórico familiar
  supplements        String?   // uso de suplementos

  // Hábitos de vida
  sleepHoursPerNight Float?
  waterIntakeLiters  Float?
  alcoholUse         String?
  smoking            String?
  physicalActivity   String?   // detalhes (complementa activityLevel)

  // Digestivo
  bowelHabit         String?

  // Alimentar
  mealsPerDay        Int?
  eatingHabits       String?   // onde come / quem cozinha / mastigação / ultraprocessados
  foodPreferences    String?

  // Geral
  clinicalNotes      String?

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```
`PatientProfile += anamnese PatientAnamnese?` (back-relation 1:1, sem coluna).

shared-types (`packages/shared-types/src/v1/anamnese.ts`): `PatientAnamnese` (datas ISO) + `UpsertAnamneseRequest` (todos os campos acima opcionais; sem `id`/`patientId`/datas). Exportado de `v1/index.ts`.

## API

Sub-recurso sob patients (mirando `nutrition-targets`). Módulo `anamnese` (controller + service) ou dentro do módulo patients:
- **`GET /v1/patients/:id/anamnese`** `@Roles(NUTRITIONIST)`: a anamnese do paciente (`resolveScopeNutritionistId`, ownership do paciente → 404) ou `null` se não houver.
- **`PUT /v1/patients/:id/anamnese`** `@Roles(NUTRITIONIST)` (body `UpsertAnamneseRequest`): **upsert** por `patientId` (cria se não existe, atualiza se existe) — retorna o `PatientAnamnese`. Ownership → 404. Números validados (`sleepHoursPerNight`/`waterIntakeLiters` Float ≥ 0; `mealsPerDay` Int ≥ 0); textos com `MaxLength`.

`UpdatePatientAnamneseDto` com class-validator (todos `@IsOptional`). O upsert usa `prisma.patientAnamnese.upsert({ where: { patientId }, create: {...dto, patientId}, update: dto })` após checar a posse do paciente.

## Web

- `apps/web/src/lib/api/anamnese.ts`: `getAnamnese(patientId)` + `upsertAnamnese(patientId, body)` (via `browserApiFetch`).
- `apps/web/src/lib/queries/anamnese.ts`: `useAnamnese(patientId)` (key `['anamnese', patientId]`) + `useUpsertAnamnese(patientId)` (invalida a key).
- `apps/web/src/components/patients/anamnese-section.tsx` (`{ patientId, canEdit }`): um form (react-hook-form + zod, mirando `bioimpedance-section`/`nutrition-targets-section`) com os campos agrupados em cards **Clínico / Hábitos de vida / Digestivo / Alimentar / Geral**; a maioria `Textarea`, os numéricos (`sleepHoursPerNight`, `waterIntakeLiters`, `mealsPerDay`) `Input type=number`. **"Salvar"** → `useUpsertAnamnese`. Quando `!canEdit`, os campos ficam desabilitados (`<fieldset disabled>`), sem botão salvar. Estados de loading/erro como as outras seções.
- Nova aba **"Anamnese"** no `patient-detail.tsx` — logo após **"Dados"** (é a coleta inicial): `<TabsTrigger value="anamnese">Anamnese</TabsTrigger>` + `<TabsContent value="anamnese"><AnamneseSection patientId={patient.id} canEdit={canEdit} /></TabsContent>`. Visível a todos os papéis do dashboard; edição só com `canEdit` (padrão da Bioimpedância).

## Testes

- **API (jest):** `PUT` cria a anamnese quando não existe e **atualiza** o mesmo registro 1:1 numa segunda chamada (upsert por `patientId`); `GET` retorna a anamnese ou `null`; paciente não-possuído → 404 (tanto GET quanto PUT); validação (número negativo → 400). Mirar `nutrition-targets` spec.
- **Web (vitest):** `AnamneseSection` renderiza os campos a partir de uma anamnese mockada; "Salvar" chama a mutation de upsert com o corpo; `!canEdit` desabilita o form (sem botão salvar). O `patient-detail` mostra a aba "Anamnese".
- **shared-types:** `build` limpo.

## Restrições

- Migração **aditiva** (nova tabela + back-relation; `onDelete: Cascade`). shared-types reconstruído. **Sem novas dependências.** pt-BR.
- Nutricionista-only (web); paciente/mobile inalterado. `@Roles(NUTRITIONIST)` + ownership do paciente (→ 404), `resolveScopeNutritionistId`.
- Reusa os padrões existentes (seções do detalhe do paciente, react-hook-form + zod, sub-recurso patient-scoped como nutrition-targets). Não duplicar os campos clínicos que já vivem no `PatientProfile`.
- Combinar estilos de aspas (api aspas simples; web por arquivo). Testes API JEST / web vitest. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** dar push/PR sem pedir. Branch `feat/anamnese`. Verificar por área: shared-types build; API test+tsc; web test+tsc. (mobile inalterado — rodar tsc só se algo ripple, não esperado.)

## Mapa de arquivos

- `apps/api/prisma/schema.prisma` (+ `PatientAnamnese` + back-relation) + migração
- `packages/shared-types/src/v1/anamnese.ts` (novo) + `v1/index.ts`
- `apps/api/src/patients/anamnese/` (module + controller `patients/:id/anamnese` + service + DTO + specs) — ou sob o módulo patients existente
- `apps/web/src/lib/api/anamnese.ts` + `lib/queries/anamnese.ts` + `components/patients/anamnese-section.tsx` (+ test) + `patient-detail.tsx` (aba) + `lib/validation/anamnese.ts` (zod)
