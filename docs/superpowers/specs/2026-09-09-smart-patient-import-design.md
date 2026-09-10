# Importação inteligente de pacientes — Design Spec

**Date:** 2026-09-09
**Status:** Approved for planning (brainstorming 2026-09-09)
**Supersedes, in part:** `docs/superpowers/specs/2026-06-04-nutritionist-created-patients-design.md` — o create deixa de ser invite-on-create; ficha sem e-mail deixa de estar fora de escopo. Bulk import deixa de estar fora de escopo. Ligar/fundir conta pré-existente no Supabase continua fora.

## Context & purpose

Quem já tem base em outro sistema (Dietbox, WebDiet, planilha própria) não assina um produto que exige recadastrar dezenas ou centenas de pacientes, um a um, com e-mail obrigatório e convite no ato.

Hoje `POST /v1/patients` exige nome + e-mail, cria a conta no Supabase e dispara o convite. `PatientProfile.userId` é obrigatório; nome e e-mail moram em `User`. Telefone não existe no paciente. Peso mora em `BodyAssessment`, não na ficha. Não há parser de planilha.

Este trabalho separa **ficha** de **conta**, permite criar e importar sem e-mail, grava telefone, e oferece importação com planilha modelo **ou** qualquer Excel/CSV, mapeando colunas (dicionário + IA nos cabeçalhos + confirmação humana). Convite é um ato explícito posterior.

## Goal

Done when: o nutricionista baixa um modelo, ou sobe qualquer planilha; confirma o mapeamento das colunas; grava fichas com nome obrigatório e o restante opcional (telefone, e-mail, clínica, uma avaliação, anamnese); ninguém recebe convite nesse fluxo; depois, na ficha, informa e-mail se faltar e clica **Enviar convite**; o cadastro avulso (`+ Novo paciente`) segue as mesmas regras.

## Decisions (approved in brainstorming)

1. Ficha pode nascer sem e-mail e sem conta.
2. Depois, o nutricionista coloca o e-mail na ficha e envia o convite.
3. Paciente ganha telefone/WhatsApp neste trabalho (mesmo canônico `55…` do nutri).
4. Importar **só grava**. E-mail na planilha não dispara convite.
5. `+ Novo paciente` é o mesmo ciclo: nome obrigatório, telefone e e-mail opcionais, convite à parte.
6. Destinos da planilha: contato + ficha + **uma** `BodyAssessment` + anamnese. Fora: plano, agenda, financeiro, exames, fotos, recordatório, CPF/endereço (sem campo).
7. Abordagem de identidade: **a ficha é o paciente**. `userId` opcional. Sem User fantasma.

## Out of scope

- Convidar em lote.
- Trocar e-mail depois que a conta existe.
- Ligar/fundir e-mail que já é conta no Supabase (continua 409 no convite).
- Importar plano, agenda, financeiro, exames, fotos, recordatório.
- Telefone único; WhatsApp “é número válido na Meta”.
- Funcionário criar/importar/convidar (continua só nutricionista).
- App mobile além do que já funciona para quem tem conta (paciente sem convite não entra no app).
- Trocar o gateway de IA (`OpenAIProvider` continua o único SDK).

---

## 1. Domain model

**Paciente** = `PatientProfile` (ficha). **Conta** = `User` + identidade Supabase. **Convite** cria a conta e liga `userId`.

### `PatientProfile` (mudança)

```prisma
model PatientProfile {
  id             String   @id @default(uuid())
  userId         String?  @unique
  user           User?    @relation(fields: [userId], references: [id])
  nutritionistId String?
  nutritionist   NutritionistProfile? @relation(fields: [nutritionistId], references: [id])

  name              String
  email             String?
  phone             String?  // dígitos canônicos, igual NutritionistProfile.whatsappNumber
  isDemo            Boolean  @default(false)

  // …campos clínicos existentes inalterados…

  @@index([nutritionistId])
}
```

Índice único parcial (SQL na migration, Prisma não expressa `WHERE`):

```sql
CREATE UNIQUE INDEX "PatientProfile_email_key"
  ON "PatientProfile" (email)
  WHERE email IS NOT NULL;
```

`User.email` permanece único e obrigatório: só existe `User` de paciente depois do convite, e o e-mail da conta copia o da ficha.

Telefone **não** é único. Nome duplicado é permitido.

### Fonte da verdade

| Dado | Onde | Notas |
|---|---|---|
| Nome do paciente | `PatientProfile.name` | Se houver conta, `User.name` (e `user_metadata.name` no convite) acompanha o PATCH de nome |
| E-mail | `PatientProfile.email` | Depois do convite, imutável neste trabalho |
| Telefone | `PatientProfile.phone` | `canonicalizeWhatsappNumber` |
| Login | `User` | Só após convite |

### `inviteStatus` (derivado, não coluna)

- `NOT_INVITED` — `userId == null`
- `INVITED` — `userId` set, `firstAppLoginAt == null`
- `ACTIVE` — `firstAppLoginAt` set

### Migração dos pacientes atuais

Todos já têm `User`. A migration:

1. Adiciona `name`, `email`, `phone`, `isDemo`; torna `userId` nullable.
2. Copia `User.name` → `PatientProfile.name`, `User.email` → `PatientProfile.email`.
3. `isDemo = true` onde `User.authProvider` é o provider demo.
4. Cria o índice único parcial de e-mail.
5. `name` NOT NULL depois do backfill.

Ninguém perde conta.

### Demo do tour

`demo: true` no create: ficha com `isDemo`, **sem** `User`, sem convite, sem e-mail de `example.com`. `deleteDemoPatient` apaga a ficha; o `User.delete` só roda se `userId` existir (compat com demos antigos).

### Outros writes de paciente

`UsersService.createWithProfile` (self-onboard com `referralCode`) preenche `PatientProfile.name` + `email` + `userId` na ficha que cria — o paciente já autenticou, então nasce com conta. `createInvitedPatient` **não** cria ficha: liga a conta à ficha já existente (ver §3).

---

## 2. shared-types

`PatientUserSummary` deixa de carregar nome/e-mail da ficha.

```ts
export type PatientInviteStatus = 'NOT_INVITED' | 'INVITED' | 'ACTIVE';

export interface PatientSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  inviteStatus: PatientInviteStatus;
  user: { id: string } | null;
  // …clínica, imc, isDemo, timestamps — isDemo vem da coluna, não de authProvider
}

export interface CreatePatientRequest {
  name: string;
  email?: string;
  phone?: string;
  // clínica opcional + demo?: boolean
}

export type UpdatePatientRequest = Partial<
  Omit<CreatePatientRequest, 'demo'>
> & {
  canLogAssessments?: boolean;
  showMealTargetToPatient?: boolean;
};
```

PATCH de `email` com `userId` já setado → `422`. Lista e busca filtram `name`, `email` e `phone` na ficha (`contains` insensitive).

Toda leitura web que hoje usa `patient.user.name` / `patient.user.email` passa a `patient.name` / `patient.email`. Superfície: lista, detalhe, agenda, PDF de evolução, widget de AI jobs, Meta activation (nome). Nutricionista e funcionário **não** mudam: nome deles continua em `User`.

---

## 3. API — ficha e convite

Autorização: criar / atualizar / importar / convidar = `@Roles(NUTRITIONIST)`. Listar / detalhe = nutricionista e funcionário.

### `POST /v1/patients`

Cria **só a ficha**. Não chama `inviteUser`.

- `name` obrigatório (2–200).
- `email` opcional; se vier, formato + unicidade na ficha → 409 se colidir.
- `phone` opcional; canônico; inválido → 400.
- Clínica opcional (mesmo `UpdatePatientDto`).
- `demo: true` → `isDemo`, sem conta.
- `201` + `PatientDetail`.
- E-mail `example.com` / `test` / `invalid` / `localhost`: a guarda `UNDELIVERABLE_EMAIL` **sai do create** (não há convite). Continua no **convite**.

`MetaCtx`: igual ao create atual — se a request não traz `x-meta-event-id`, `maybeEvaluateActivation` no servidor (o comentário de “importação em lote” já previa isso).

### `PATCH /v1/patients/:id`

Ganha `name`, `email`, `phone`. E-mail só se `NOT_INVITED`. Nome replica para `User.name` quando há conta.

### `POST /v1/patients/:id/invite`

- `404` se a ficha não é do nutri.
- `422` sem e-mail na ficha, ou e-mail undeliverable.
- `409` se já tem `userId`, ou se o e-mail já existe no Supabase / `User`.
- Senão: `inviteUserByEmail` (igual hoje, `redirectTo` `/accept-invite`) → cria só o `User` (role `PATIENT`, **sem** `patientProfile.create`) → `PatientProfile.userId = User.id`. Rollback `deleteUser` se o write local falhar. `createInvitedPatient` deixa de criar ficha nova: passa a receber o `patientId` existente e só abre a conta.
- `200` + `PatientDetail` com `inviteStatus: INVITED`.

Não há convite em lote neste spec.

---

## 4. Catálogo de destinos da planilha

Cada destino tem uma chave estável (o valor gravado no mapeamento) e rótulo pt-BR (header do modelo).

### Contato e ficha

| key | Rótulo modelo | Aliases (não exaustivo; o dicionário no código é a fonte) |
|---|---|---|
| `name` | Nome | Nome completo, Paciente, Cliente |
| `email` | E-mail | Email, Mail, Correio |
| `phone` | Telefone | Celular, WhatsApp, Whats, Fone, Telefone celular |
| `birthDate` | Data de nascimento | Nascimento, DN, Data nasc, Birthday |
| `gender` | Sexo | Gênero, Sex, Genero |
| `height` | Altura (cm) | Altura, Estatura, Height |
| `targetWeight` | Peso alvo (kg) | Peso meta, Peso desejado, Meta de peso |
| `objective` | Objetivo | Meta, Goal |
| `activityLevel` | Nível de atividade | Atividade, Atividade física, PA |
| `restrictions` | Restrições | Restrição alimentar, Dieta |
| `allergies` | Alergias | Alergia, Alergia alimentar |
| `medicalConditions` | Condições médicas | Patologias, Doenças, CID, Comorbidades |
| `notes` | Observações | Notas, Obs, Observacao, Anotações |

### Avaliação (`assessment.*`) — no máximo uma por linha

| key | Rótulo modelo |
|---|---|
| `assessment.assessmentDate` | Data da avaliação |
| `assessment.weight` | Peso (kg) |
| `assessment.bodyFatPercentage` | Gordura (%) |
| `assessment.muscleMass` | Massa muscular (kg) |
| `assessment.leanMass` | Massa magra (kg) |
| `assessment.muscleMassPercentage` | Massa muscular (%) |
| `assessment.leanMassPercentage` | Massa magra (%) |
| `assessment.visceralFat` | Gordura visceral |
| `assessment.basalMetabolicRate` | TMB |
| `assessment.bodyWaterPercentage` | Água corporal (%) |
| `assessment.boneMass` | Massa óssea (kg) |
| `assessment.metabolicAge` | Idade metabólica |
| `assessment.waistCircumference` | Cintura (cm) |
| `assessment.hipCircumference` | Quadril (cm) |
| `assessment.chestCircumference` | Tórax (cm) |
| `assessment.armCircumference` | Braço (cm) |
| `assessment.thighCircumference` | Coxa (cm) |
| `assessment.abdomenCircumference` | Abdômen (cm) |
| `assessment.contractedArmCircumference` | Braço contraído (cm) |
| `assessment.calfCircumference` | Panturrilha (cm) |
| `assessment.notes` | Notas da avaliação |

Aliases típicos: Peso, Peso atual, Weight, %GC, BF%, Circunferência de cintura, CC, CQ.

Se a linha tiver **qualquer** `assessment.*` preenchido, cria-se uma `BodyAssessment`. Sem `assessment.assessmentDate`, usa a data do import (hoje, não futura). Validadores = `CreateAssessmentDto` (peso 0–500, % 0–100, etc.). Valor fora do bound → erro da linha, não grava essa ficha.

### Anamnese (`anamnese.*`) — 1:1 na ficha nova

| key | Rótulo modelo |
|---|---|
| `anamnese.mainComplaint` | Queixa principal |
| `anamnese.medications` | Medicações |
| `anamnese.familyHistory` | Histórico familiar |
| `anamnese.supplements` | Suplementos |
| `anamnese.sleepHoursPerNight` | Horas de sono |
| `anamnese.waterIntakeLiters` | Água (L) |
| `anamnese.alcoholUse` | Álcool |
| `anamnese.smoking` | Tabagismo |
| `anamnese.physicalActivity` | Atividade física (anamnese) |
| `anamnese.bowelHabit` | Hábito intestinal |
| `anamnese.mealsPerDay` | Refeições por dia |
| `anamnese.eatingHabits` | Hábitos alimentares |
| `anamnese.foodPreferences` | Preferências alimentares |
| `anamnese.clinicalNotes` | Notas clínicas |

Qualquer `anamnese.*` preenchido → cria `PatientAnamnese` junto com a ficha (import só cria paciente novo; não há merge com ficha existente).

Chave reservada: `ignore` (coluna deliberadamente fora).

---

## 5. Mapeamento de colunas

Ordem, por coluna da planilha:

1. **Match exato** com o rótulo do modelo (trim, case-insensitive, acentos normalizados).
2. **Dicionário de aliases** (trim, case-insensitive, acentos normalizados).
3. **IA** só nas colunas que 1–2 não casaram. `OpenAIProvider.generateStructured`, tier `fast`, tipo novo `COLUMN_MAPPING`. Payload: lista de headers não casados + catálogo `{ key, label, aliases }`. **Nunca envia células.** Schema Zod: `{ mappings: { header: string, field: string \| null }[] }` — `field` é key do catálogo ou `null` (ignorar). Falha da IA → segue com 1–2 apenas; preview não quebra.
4. Nutri **confirma** na UI (dropdown por coluna, opção Ignorar). Dois headers no mesmo field (exceto `ignore`) → `400` no commit (“campo X mapeado duas vezes”). A UI impede o submit nesse estado.

`AIInteraction` registra o prompt de headers (não é dado de saúde). `nutritionistId` preenchido; `patientId` nulo.

Normalização de **valores** é parser determinístico, não LLM:

- Data: `DD/MM/YYYY`, `YYYY-MM-DD`, serial Excel (via parser da lib). Futuro → erro da linha.
- Altura: número `<= 3` trata como metros → cm (`1,65` → `165`); `> 3` já é cm.
- Decimal BR: vírgula.
- Sexo: `M`/`F`/`Masculino`/`Feminino`/`Homem`/`Mulher`/`Outro`/`Prefiro não informar` e os labels de `GENDER_LABELS`.
- Objetivo: labels de `OBJECTIVE_LABELS` + emagrecer, hipertrofia, manter.
- Atividade: labels de `ACTIVITY_LABELS`.
- Telefone: `canonicalizeWhatsappNumber`; falha → erro da linha (a ficha não grava).
- E-mail: trim + lowercase; inválido → erro da linha.

Linha sem `name` (vazio) → skip com erro `"Nome obrigatório"`. Não é paciente.

---

## 6. API — importação

Controller próprio para não colidir com `GET /patients/:id`:

`@Controller({ path: 'patients/import', version: '1' })` `@Roles(NUTRITIONIST)`.

### `GET /v1/patients/import/template`

`.xlsx` (ExcelJS). Aba **Pacientes**: header = rótulos oficiais na ordem contato → ficha → avaliação → anamnese. Sem linha de exemplo (evita importar o exemplo por acidente). Aba **Instruções**: e-mail opcional, convite não sai, primeira linha = cabeçalho, primeira aba de dados.

`Content-Disposition: attachment; filename="inutri-pacientes.xlsx"`.

O web também pode espelhar o download por este endpoint (não um arquivo estático divergente).

### `POST /v1/patients/import/preview`

`multipart/form-data` campo `file`. `.xlsx` ou `.csv`. Máx 5 MB. Primeira worksheet. Primeira linha = header. Máx 500 linhas de dados; acima → `422` com a contagem.

Resposta `200`:

```ts
interface ImportPreviewResponse {
  headers: string[];
  suggestedMapping: Record<string, string>; // header → key; sem match → "ignore"
  mappedBy: Record<string, 'template' | 'alias' | 'ai' | 'unmapped'>; // unmapped ⇔ ignore
  rowCount: number;
  previewRows: { line: number; values: Record<string, string> }[]; // até 20, cruas
}
```

Não persiste o arquivo. Confirm reenvia o arquivo + o mapeamento.

### `POST /v1/patients/import`

`multipart` `file` + campo JSON `mapping` (`Record<header, key>`). Re-parse no servidor. Aplica mapeamento, valida linha a linha.

Por linha, transação própria: `PatientProfile` → `BodyAssessment` opcional → `PatientAnamnese` opcional. Falha da linha não desfaz as anteriores.

E-mail duplicado (outra ficha, ou já criado neste lote) → erro da linha, skip. Nome repetido → cria. Sem e-mail → cria.

Depois do lote, um único `maybeEvaluateActivation` (não por linha).

Resposta `200`:

```ts
interface ImportCommitResponse {
  created: number;
  skipped: number;
  errors: { line: number; name: string | null; message: string }[];
}
```

`created == 0` e todas as linhas com erro ainda é `200` (o nutri lê o relatório). Arquivo ilegível / sem header → `400`.

Lib: **ExcelJS** no API. CSV: parse simples (primeira linha header, vírgula; se o header tiver `;` e não `,`, usa `;`). Sem `.xls` binário antigo.

---

## 7. UI web

Só nutricionista (`canManagePatients`). pt-BR.

### Lista `/patients`

Ao lado de **+ Novo paciente**: **Importar** (`/patients/import`) e, no fluxo de importar, **Baixar planilha modelo**.

Colunas da lista: nome (ficha), telefone, e-mail, status de convite (sem convite / convite enviado / ativo). Busca cobre nome, e-mail e telefone. Link WhatsApp (`wa.me`) quando há `phone`.

### Cadastro `/patients/new` e edição

Nome obrigatório. Telefone e e-mail opcionais. Texto curto: o convite do app é enviado depois, na ficha, quando houver e-mail. Some a expectativa atual de “salvar = paciente recebe e-mail”. Tour demo: preenche nome (e-mail de `example.com` deixa de ser necessário).

### Detalhe

Badge de convite. Se `NOT_INVITED` e tem e-mail: botão **Enviar convite** (confirmação: “O paciente vai receber um e-mail para criar a senha do app.”). Se `NOT_INVITED` sem e-mail: botão desabilitado, dica para preencher o e-mail. Se `INVITED`/`ACTIVE`: sem botão de convite. Telefone editável; ícone WhatsApp.

### Assistente `/patients/import`

1. Baixar modelo **ou** soltar `.xlsx`/`.csv`.
2. Tabela: coluna da planilha → destino (select do catálogo + Ignorar). Indicador de como foi sugerido (modelo / alias / IA). Coluna sem destino começa em Ignorar.
3. Preview das primeiras linhas já interpretadas + contagem de linhas que vão falhar (nome vazio, e-mail inválido) — validação client-side é cortesia; o commit é a fonte.
4. **Importar N pacientes**. Não há checkbox de convite.
5. Resultado: criados / pulados / lista de erros por linha. Voltar à lista.

Empty state da lista (zero pacientes) pode mencionar a importação; não é obrigatório no v1 se poluir o tour.

---

## 8. Error handling

| Caso | Comportamento |
|---|---|
| IA fora do ar no preview | Mapeamento só dicionário; preview ok |
| Campo mapeado duas vezes no commit | 400 no commit inteiro (mapeamento inválido, não é erro de linha) |
| E-mail já na base / no lote | Skip da linha |
| E-mail já no Supabase no **convite** | 409, ficha intacta |
| Telefone ilegível | Skip da linha (import) ou 400 (form) |
| Valor de avaliação fora do bound | Skip da linha |
| >500 linhas ou >5 MB | 422 / 400, nada gravado |
| Linha sem nome | Skip |
| Create com e-mail duplicado | 409 |

PII: células da planilha não vão para o provider de IA. Logs de importação registram contagens e mensagens de erro, não a planilha.

LGPD: o nutricionista importa dado que já trata na relação profissional. Consentimento do titular continua no 1º acesso ao app (`PatientConsent`). Importados ficam com consentimento pendente até lá. Não disparar convite em massa é também a salvaguarda de comunicação.

---

## 9. Testing

**Parsers / dicionário (unit, puro):** aliases com acento/caixa; altura `1,65` → 165; Excel serial e `12/03/1990`; sexo/objetivo; telefone BR; dois headers → mesmo field rejeitado no validate do mapping.

**PatientsService:** create sem e-mail e sem `inviteUser`; create com e-mail não convida; invite cria User e liga; invite sem e-mail 422; PATCH e-mail após convite 422; demo sem User.

**Import service:** preview sugere `Nome`→`name` sem IA; header desconhecido chama `generateStructured` só com headers; commit cria ficha + assessment + anamnese; linha sem nome skip; e-mail duplicado skip e a seguinte grava; IA throw → preview mesmo assim.

**E2E API:** `POST /patients` sem e-mail 201 e não aparece no Supabase fake; `POST /:id/invite` convida; `POST /import/preview` + `/import` com xlsx de fixture (3 linhas, uma sem nome).

**Web (vitest):** form aceita submit sem e-mail; botão convite só com e-mail e `NOT_INVITED`; lista mostra `patient.name`; wizard mostra mapping sugerido e não tem “convidar agora”.

Fixtures de `PatientSummary`/`PatientDetail` em todo o monorepo: `user.name` → `name`. `tsc` dos três apps limpo.

---

## 10. Components / files (orientação)

- `apps/api/prisma/schema.prisma` + migration (backfill).
- `packages/shared-types/src/v1/patient.ts` (+ tipos de import).
- `apps/api/src/patients/` — DTOs create/update, `createPatient` sem invite, `invitePatient`, `deleteDemoPatient` com `userId` opcional, `toDetail`/`list` lendo a ficha.
- `apps/api/src/users/users.service.ts` — writes de perfil com `name`/`email` na ficha.
- `apps/api/src/patients/import/` — module novo: parse, dicionário, parsers, preview/commit, template, controller `patients/import`.
- `apps/api/src/ai/prompts/column-mapping.prompt.ts` + enum `COLUMN_MAPPING`.
- `apps/web` — form, lista, detalhe, `app/(app)/patients/import/page.tsx`, queries, labels de `inviteStatus`.
- Call sites `patient.user.name` (agenda, PDF, ai-jobs, meta).

Dependência nova: `exceljs` no API.

## 11. Implementation slices (para o plan, não este spec)

Ordem bloqueante:

1. **Identidade na ficha** — migration, types, leituras, create sem convite, PATCH nome/e-mail/telefone, demo sem User.
2. **Convite explícito** — `POST /:id/invite`, UI do form e do detalhe.
3. **Importação** — template, dicionário, parsers, preview/commit, wizard, IA de fallback.

1 desbloqueia 2. 2 e 3 podem em paralelo depois de 1, mas 3 depende do create-sem-convite de 1.

## 12. Dependencies / assumptions

- ExcelJS no runtime Node do API (Render).
- `OPENAI_API_KEY` + modelo `fast` já existentes; quota de AI de billing **não** se aplica a `COLUMN_MAPPING` (não é geração de plano). Não passa por `EntitlementsService.assertAiActionQuota`.
- SMTP do Supabase continua pré-requisito só do **convite**, não da importação.
- Postgres: `UNIQUE` permite vários `userId` NULL; o índice parcial cobre e-mail.
