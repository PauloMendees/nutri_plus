# Consentimento LGPD (C1) — Design

**Date:** 2026-07-20
**Branch:** `feat/lgpd-consent` (off main; TACO A1+A2+A3 já mergeado via PR #46)
**Status:** Approved design — ready for implementation plan

**Sub-projeto C1** do batch de 6 features (F ✅ → B ✅ → A/TACO ✅ → **C** → D → E). C ("Consentimento/LGPD + política de dados") foi decomposto: **C1 = registro + captura de consentimento** (este spec); C2 (direitos do titular: exportar/excluir dados) fica para depois. A política/texto já existe (`/privacy` no web); o que falta é o consentimento explícito do paciente para o tratamento de dados sensíveis (saúde), como a LGPD exige.

## Decisões (do brainstorming)

- **Titular consente no app mobile:** o paciente é o titular; o nutricionista não consente por ele. O web apenas **exibe o status** (read-only) por paciente.
- **Gate obrigatório no 1º acesso:** ao entrar no app sem consentimento (ou com versão antiga), uma tela bloqueia o uso; aceitar libera, recusar faz logout. Cobre **re-consentimento** quando a versão da política muda.
- **Consentimento único:** um aceite cobre a Política de Privacidade + o tratamento dos dados (saúde, fotos, IA) que a própria política descreve (não granular por finalidade).
- **Tabela `PatientConsent` (histórico):** uma linha por aceite (auditoria — a LGPD valoriza o registro do consentimento). O gate consulta o mais recente.
- **Política completa:** o mobile mostra um resumo + link para a `/privacy` do web (fonte única, sempre atual) — não duplica o texto no app.

## Estado atual (o que já existe)

- **Política de dados:** página pública `apps/web/src/app/privacy/page.tsx` (cita a LGPD Lei 13.709/2018; `UPDATED_AT = '9 de julho de 2026'`). É o texto canônico.
- **PII sensível:** `PatientProfile` guarda `restrictions/allergies/medicalConditions/notes`, `photoUrl`, e relaciona `assessments` (bioimpedância), `silhuetaScans` (fotos), `mealPlans`, `aiInteractions`. Dado de saúde = dado sensível sob a LGPD.
- **Fluxo do paciente:** entra pelo app mobile (`apps/mobile/app/(auth)/login.tsx` → `apps/mobile/app/(app)/_layout.tsx`). Não existe nenhum registro/tela de consentimento hoje.
- **Padrão de controllers do paciente:** `me/*` (ex.: `me/assessments`, `me/nutrition-target`) com `@Roles(UserRole.PATIENT)` + `resolveScopePatientId(ctx)`.

## Modelo de dados (migração aditiva)

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
`PatientProfile += consents PatientConsent[]` (back-relation virtual, sem coluna). Nenhum campo existente é alterado.

## Versão da política

Constante `CURRENT_PRIVACY_POLICY_VERSION` no shared-types (`packages/shared-types/src/v1/consent.ts`), valor `'2026-07-09'` (alinhado ao "Última atualização" de `/privacy`). É a **fonte única** que a API usa como "versão exigida". Bump da constante → todos os pacientes re-consentem no próximo acesso ao app. (A `/privacy` mantém seu `UPDATED_AT`; o valor deve refletir a mesma data.)

## shared-types

`packages/shared-types/src/v1/consent.ts` (novo), exportado de `v1/index.ts`:
- `CURRENT_PRIVACY_POLICY_VERSION: string` (`'2026-07-09'`).
- `interface PatientConsent { id: string; patientId: string; policyVersion: string; acceptedAt: string }` (datas ISO).
- `interface MyConsentStatus { currentVersion: string; acceptedVersion: string | null; acceptedAt: string | null; needsConsent: boolean }`.
- `interface AcceptConsentRequest { policyVersion: string }`.
- `PatientDetail += latestConsent: { policyVersion: string; acceptedAt: string } | null`.

## API

Módulo `apps/api/src/consent/` (controller + service), mirando o padrão `me/*`:
- **`GET /v1/me/consent`** `@Roles(PATIENT)` → `MyConsentStatus`. Lê o `PatientConsent` mais recente do paciente (`resolveScopePatientId`); `needsConsent = acceptedVersion == null || acceptedVersion !== CURRENT_PRIVACY_POLICY_VERSION`. Retorna `currentVersion = CURRENT_PRIVACY_POLICY_VERSION`, `acceptedVersion`, `acceptedAt`.
- **`POST /v1/me/consent`** `@Roles(PATIENT)` (body `AcceptConsentRequest`) → valida `body.policyVersion === CURRENT_PRIVACY_POLICY_VERSION` (senão `400` — cliente desatualizado); cria um `PatientConsent { patientId, policyVersion: CURRENT, acceptedAt: now }`; retorna o `MyConsentStatus` atualizado (`needsConsent: false`).
- **Nutricionista:** `patients.service.getPatient` (detalhe) inclui o consentimento mais recente → `PatientDetail.latestConsent` (`{ policyVersion, acceptedAt }` ou `null`). Somente no detalhe (não no `PatientSummary`/lista) para minimizar quebra de fixtures.

## Mobile

- `apps/mobile/lib/queries/consent.ts`: `useMyConsent()` (GET `/me/consent`, key `['consent']`) + `useAcceptConsent()` (POST `/me/consent`; `onSuccess` invalida `['consent']`).
- `apps/mobile/app/(app)/_layout.tsx`: após o auth guard, consulta `useMyConsent()`. Enquanto carrega, um spinner (não renderiza o app). Se `needsConsent`, renderiza `<ConsentGate />` (bloqueante) no lugar do conteúdo; senão, renderiza o app normal.
- `apps/mobile/components/consent/consent-gate.tsx`: tela full-screen com o texto de consentimento (pt-BR, abaixo) + botão **"Ler política completa"** (abre a `/privacy` do web via `Linking.openURL` — URL a partir da base web configurada do app, ex.: `https://inutri.life/privacy`; o plano resolve a env/const exata) + checkbox **"Li e aceito…"** + **"Aceitar e continuar"** (habilitado só com o checkbox; chama `useAcceptConsent().mutate({ policyVersion: currentVersion })`) + **"Recusar"** (faz `signOut`/logout). Erro de rede no aceite → mensagem + permite tentar de novo.
- **Texto:** *"Li e aceito a Política de Privacidade e autorizo o tratamento dos meus dados pessoais e de saúde pelo iNutri, conforme a LGPD (Lei 13.709/2018)."*

## Web

- Na página de detalhe do paciente (`apps/web/src/components/patients/patient-detail.tsx` ou o header do paciente): uma linha/badge read-only a partir de `patient.latestConsent` — **"Consentimento LGPD: aceito em DD/MM/AAAA"** (quando presente) ou **"Consentimento LGPD: pendente"** (muted, quando `null`). Sem ação para o nutricionista.

## Testes

- **API (jest):** `me/consent` GET → `needsConsent` true quando não há consentimento e quando a versão aceita ≠ atual, false quando = atual; POST grava um `PatientConsent` (versão atual) e rejeita `policyVersion` divergente (`400`); escopo do paciente (`resolveScopePatientId`); `getPatient` retorna `latestConsent` (o mais recente) e `null` quando não há.
- **Mobile (jest):** o `(app)` layout mostra o `ConsentGate` quando `needsConsent` e o conteúdo do app quando não; aceitar chama a mutation e revela o app; recusar faz logout; `tsc` limpo após a mudança de shared-type.
- **Web (vitest):** o detalhe do paciente renderiza "aceito em …" quando há `latestConsent` e "pendente" quando `null`. Atualizar fixtures de `PatientDetail` com `latestConsent`.
- **shared-types:** `build` limpo.

## Restrições

- Migração **aditiva** (nova tabela + back-relation; nada alterado). shared-types reconstruído. **Sem novas dependências** (`Linking` é do Expo, já presente). pt-BR.
- O consentimento é ato do **paciente** (mobile); o web é só leitura. `me/consent` é escopo estrito do paciente (`resolveScopePatientId`).
- Combinar estilos de aspas por arquivo (api aspas simples; web/mobile por arquivo). Testes API+mobile JEST / web vitest.
- Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** dar push/PR sem pedir. Branch `feat/lgpd-consent`.
- Verificar por área: shared-types build; API test+tsc; web test+tsc; mobile test+tsc.

## Mapa de arquivos

- `apps/api/prisma/schema.prisma` (+ `PatientConsent` + back-relation) + migração
- `packages/shared-types/src/v1/consent.ts` (novo) + `v1/index.ts`; `v1/patient.ts` (`PatientDetail += latestConsent`)
- `apps/api/src/consent/` (module + controller `me/consent` + service + DTO `accept-consent.dto.ts` + specs)
- `apps/api/src/patients/patients.service.ts` (getPatient inclui `latestConsent`) + spec
- `apps/mobile/lib/queries/consent.ts` + `apps/mobile/app/(app)/_layout.tsx` + `apps/mobile/components/consent/consent-gate.tsx` (+ testes)
- `apps/web/src/components/patients/patient-detail.tsx` (badge de status) + fixtures/testes
