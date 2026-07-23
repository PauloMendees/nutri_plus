# Direitos do Titular LGPD (C2) — Design

**Date:** 2026-07-20
**Branch:** `feat/lgpd-data-rights` (off main; C1/consentimento mergeado via PR #47)
**Status:** Approved design — ready for implementation plan

**Sub-projeto C2** (2ª parte do C/LGPD). Os direitos do titular: **acesso/portabilidade** (exportar meus dados) e **eliminação** (apagar minha conta). O C1 entregou o consentimento; o C2 entrega o export (novo) e **corrige** a exclusão de conta (que já existe mas tem um bug real). Ambos são patient-facing (app mobile); o web/nutricionista não muda.

## Decisões (do brainstorming)

- **Export em JSON:** um `GET /v1/me/data-export` retorna todos os dados do próprio paciente em JSON; o app baixa e compartilha o arquivo. Formato portável favorecido pela LGPD.
- **Fotos por URL:** o export referencia fotos por URL/metadados (sem empacotar binários).
- **Corrigir a exclusão:** completar o `deleteMyAccount` (bug real) + remover a foto de perfil do storage.
- **Planos inteiros no export:** os `mealPlans` vão com a árvore completa (refeições/opções/itens).

## Estado atual (o que já existe)

- **Exclusão (eliminação) — já existe, mas com bug.** `DELETE /v1/me` → `PatientsService.deleteMyAccount` (`apps/api/src/patients/patients.service.ts:298`), já com UI mobile ("Apagar conta" + `Alert` de confirmação em `apps/mobile/app/(app)/configuracoes/index.tsx`). A transação de teardown apaga `outsideHomeRequest`, `aIInteraction`, `appointment`, `bodyAssessment`, `mealPlan`, depois `patientProfile.delete` + `user.delete`, e por fim `supabaseAdmin.deleteUser`.
  - **BUG:** não apaga `NutritionTarget` nem `SilhuetaScan` — ambos são FK `Restrict` (padrão do Prisma). Para qualquer paciente que tenha **uma Meta** ou **uma silhueta** salva, o `patientProfile.delete` estoura FK (P2003 → 500) e a exclusão falha. (`PatientConsent` é `Cascade` — cai sozinho.)
  - **Storage:** não remove a foto de perfil (`photoUrl`, bucket `patient-photos`) → PII residual após a "exclusão". (Silhuetas **não** guardam fotos: `silhueta.service.ts` envia as imagens em base64 inline para a OpenAI e nunca persiste; o `SilhuetaScan` só guarda resultados — logo não há foto de silhueta a remover.)
- **Export — não existe.** Nenhum endpoint de exportação de dados.
- **Padrões reutilizáveis:** controllers `me/*` (`@Roles(PATIENT)` + `resolveScopePatientId`); download/share no mobile via `expo-file-system/legacy` (`FileSystem.downloadAsync` com header de auth) + `expo-sharing` (`Sharing.shareAsync`) — já usado no download do PDF de evolução (`apps/mobile/lib/queries/assessments.ts`); `removePhoto` deriva o path da `photoUrl` e chama `supabaseAdmin.removeObject`.

## Parte 1 — Export (direito de acesso/portabilidade) — NOVO

- **API** `GET /v1/me/data-export` `@Roles(PATIENT)` (`resolveScopePatientId`) → `MyDataExport` (JSON, `application/json`), com **os dados do próprio paciente**:
  ```
  {
    exportedAt: string,           // ISO, carimbado no servidor
    profile: { name, email, birthDate, gender, height, targetWeight, objective,
               activityLevel, restrictions, allergies, medicalConditions, notes,
               canLogAssessments, showMealTargetToPatient, photoUrl,
               createdAt, updatedAt },
    assessments: BodyAssessment[],
    mealPlans: MealPlan[],        // árvore completa (meals/options/items)
    nutritionTargets: NutritionTarget[],
    silhuetaScans: SilhuetaScan[],// metadados/resultados (sem fotos — não existem)
    appointments: Appointment[],  // os agendamentos do paciente
    consents: PatientConsent[],
  }
  ```
  Tudo escopado ao `patientId` do chamador (nunca dados de outro paciente). `photoUrl` do perfil vai como URL (referência).
- **shared-types:** `MyDataExport` (compõe os tipos existentes `BodyAssessment`/`MealPlan`/`NutritionTarget`/`SilhuetaScan`/`Appointment`/`PatientConsent` + o `profile`), exportado de `v1/index.ts`.
- **Serviço:** um método patient-facing (no `PatientsService` ou um `data-export` service) monta o objeto com queries scoped por `patientId`. Servido por um endpoint no controller `me` existente (`me.controller.ts`, que já tem `GET me/nutritionist` e `DELETE me`) — adiciona `GET me/data-export`.
- **Mobile:** botão **"Exportar meus dados"** em `configuracoes` (perto do "Apagar conta"): baixa o `/me/data-export` para um arquivo de cache (`FileSystem.downloadAsync` com o header `Authorization`) e chama `Sharing.shareAsync` (mesmo padrão do PDF de evolução; sem nova dep). Nome do arquivo ex.: `meus-dados-inutri.json`. Estados de loading/erro como no botão de exclusão.

## Parte 2 — Correção da exclusão (eliminação)

- **`deleteMyAccount`** (`patients.service.ts`): adicionar à transação de teardown, **antes** do `patientProfile.delete`:
  ```ts
  await tx.nutritionTarget.deleteMany({ where: { patientId } });
  await tx.silhuetaScan.deleteMany({ where: { patientId } });
  ```
  (`patientConsent` é `Cascade` — não precisa; opcionalmente incluir por simetria.)
- **Storage (best-effort):** antes da transação, ler a `photoUrl` do paciente; **após** a transação + `deleteUser`, remover a foto de perfil do bucket `patient-photos` (derivar o path da URL, como `removePhoto`) via `supabaseAdmin.removeObject`, **best-effort** (uma falha de remoção não deve reverter/impedir a exclusão — a conta/DB/auth já foram apagados). Não há foto de silhueta a remover.
- **Teste de regressão:** um paciente **com** `nutritionTarget` + `silhuetaScan` é apagado sem erro — os `deleteMany` desses dois são chamados na transação e a remoção da foto é tentada. (Cobre exatamente o bug que hoje daria 500.)

## Testes

- **API (jest):** `data-export` retorna os dados do próprio paciente (escopo `resolveScopePatientId`; não vaza de outro paciente); o envelope inclui as seções esperadas (profile/assessments/mealPlans/nutritionTargets/silhuetaScans/appointments/consents). `deleteMyAccount`: agora chama `nutritionTarget.deleteMany` + `silhuetaScan.deleteMany` (regressão do bug) e tenta `removeObject` da foto de perfil quando há `photoUrl` (e não falha quando o remove dá erro — best-effort). Mirar o `deleteMyAccount` spec existente (`patients.service.spec.ts:663`).
- **Mobile (jest):** o botão "Exportar meus dados" baixa o export e dispara `Sharing.shareAsync` (mockar `expo-file-system/legacy` + `expo-sharing`, como `assessments.test.tsx`); estado de erro quando o download falha; `tsc` limpo.
- **shared-types:** `build` limpo.

## Restrições

- **Sem migração** (nenhuma mudança de schema — export lê dados existentes; a correção da exclusão é lógica de serviço). shared-types reconstruído. **Sem novas dependências** (`expo-file-system/legacy` + `expo-sharing` já presentes).
- pt-BR. Patient-facing (mobile); web/nutricionista inalterado. `me/data-export` é escopo estrito do paciente (`resolveScopePatientId`, `@Roles(PATIENT)`).
- Remoção de storage na exclusão é **best-effort** (não reverte a exclusão da conta).
- Combinar estilos de aspas por arquivo (api aspas simples; mobile por arquivo). Testes API+mobile JEST / web vitest (sem mudança no web).
- Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** dar push/PR sem pedir. Branch `feat/lgpd-data-rights`.
- Verificar por área: shared-types build; API test+tsc; mobile test+tsc. (web só se algo ripple — não esperado.)

## Mapa de arquivos

- `packages/shared-types/src/v1/data-export.ts` (novo, `MyDataExport`) + `v1/index.ts`
- `apps/api/src/patients/patients.service.ts` — método `exportMyData(ctx)` (monta o `MyDataExport` scoped) + `deleteMyAccount` (fix: `nutritionTarget`/`silhuetaScan` deleteMany + remove a foto de perfil best-effort) + `patients.service.spec.ts`
- `apps/api/src/patients/me.controller.ts` — `GET me/data-export`
- `apps/mobile/lib/queries/data-export.ts` (novo — `downloadMyData()` via `FileSystem.downloadAsync` + `Sharing.shareAsync`) + `apps/mobile/app/(app)/configuracoes/index.tsx` (botão "Exportar meus dados") + testes
