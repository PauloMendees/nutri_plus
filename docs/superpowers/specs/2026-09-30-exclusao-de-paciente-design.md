# Exclusão de paciente pela nutricionista, com cópia dos dados por e-mail

**Data:** 2026-09-30 · **Status:** aguardando revisão · **Branch:** `fix/pacientes-bio-tutoriais`

## Problema

A nutricionista não consegue excluir um paciente real: `DELETE /patients/:id`
(`removeDemo` → `deleteDemoPatient`) recusa com 403 quando `isDemo = false`.
Só o próprio paciente pode apagar a conta, pelo app (`deleteMyAccount`).

## Objetivo

- A nutricionista exclui definitivamente um paciente seu.
- **Antes** de apagar, o paciente recebe um e-mail com uma cópia de todos os
  seus dados (JSON anexado) e um texto explicando que o cadastro foi encerrado
  pela nutricionista, o que o arquivo contém e como usá-lo.
- Se o envio do e-mail falhar, **nada é apagado**.
- Paciente sem e-mail: a nutricionista baixa o arquivo na hora e a exclusão
  segue sem envio.

**Fora do escopo:** PDF legível (só JSON); exclusão por funcionários; desfazer
a exclusão; envio assíncrono/fila.

## Regras

- Só `NUTRITIONIST`, e só pacientes dela (`requireOwned`). O controller já é
  `@Roles(UserRole.NUTRITIONIST)` na classe; a rota não abre para `EMPLOYEE`.
- Paciente real exige `confirmName` no corpo, igual ao nome do paciente
  ignorando maiúsculas/minúsculas e espaços nas pontas → senão **400**.
- Paciente demo mantém o comportamento atual: sem `confirmName`, sem e-mail.
- Com e-mail: e-mail aceito pelo Resend → exclusão. Resend falhou → **502** e
  nenhum dado removido.
- Sem e-mail: exclusão direta (o web já ofereceu o download antes).

## Arquitetura (API — `apps/api/src/patients`)

### `buildPatientExport(patientId)` (extraído)

O corpo atual de `exportMyData` vira um método privado que recebe o
`patientId`. `exportMyData(ctx)` passa a ser `buildPatientExport(resolveScopePatientId(ctx))`.
Mesmo formato de JSON de hoje (`exportedAt`, `profile`, `anamnese`,
`assessments`, `mealPlans`, `foodRecalls`, `nutritionTargets`, `silhuetaScans`,
`appointments`, `consents`, `consultationTranscripts`, `mealLogs`).

### `purgePatient(patientId)` (extraído)

A exclusão em cascata, hoje duplicada em `deleteMyAccount` e
`deleteDemoPatient` (e esta última não remove áudios nem foto):

1. Lê antes da transação: `userId`, `photoUrl`, `authProviderId` do usuário
   (se houver) e os `storagePath` de `ConsultationAudio`.
2. Transação: `outsideHomeRequest`, `aIInteraction`, `appointment`,
   `bodyAssessment`, `nutritionTarget`, `silhuetaScan`, `mealPlan` →
   `patientProfile` → `user` (se `userId`). Consentimentos e áudios caem em
   cascata com o perfil.
3. Depois do commit, best-effort (nunca lança): `supabaseAdmin.deleteUser`
   (se havia usuário com `authProviderId`), foto do bucket `patient-photos`,
   cada áudio do bucket `consultation-audio`.

`deleteMyAccount`, `deleteDemoPatient` e a exclusão nova usam `purgePatient`.

### `deletePatient(ctx, id, confirmName?)` (novo)

1. `requireOwned(ctx, id)`; carrega `name`, `email`, `isDemo`.
2. `isDemo` → `purgePatient(id)` e fim (compatível com o banner de demo).
3. `confirmName` normalizado ≠ nome normalizado → `BadRequestException('O nome digitado não confere.')`.
4. Tem `email` → `export = buildPatientExport(id)`; monta o e-mail
   (`buildPatientDeletedEmail`) e chama `resend.sendEmail` com o JSON anexado.
   Qualquer erro do envio → `BadGatewayException('Não foi possível enviar o e-mail com os dados; nada foi excluído.')`.
5. `purgePatient(id)`.
6. `Logger.log` sem dados pessoais: `patient deleted by nutritionist {nutritionistId} (email sent: yes|no)`.

### Controller

- `DELETE /patients/:id` → `deletePatient(ctx, id, body?.confirmName)`, 204.
  DTO `DeletePatientDto { @IsOptional() @IsString() @MaxLength(200) confirmName?: string }`.
- `GET /patients/:id/export` → `requireOwned` + `buildPatientExport(id)`
  (JSON, `Content-Disposition` não é necessário; o web monta o download).

### `ResendService`

`SendEmailInput` ganha `attachments?: { filename: string; content: string /* base64 */ }[]`,
repassado como `attachments` no payload da API do Resend. Remetente:
`SUPPORT_FROM_EMAIL` (mesma variável dos e-mails de ciclo de vida); sem ela →
503 do próprio `ResendService` → vira o 502 do passo 4 (nada apagado).
`replyTo`: e-mail da nutricionista.

### Módulo

`PatientsModule` passa a importar o provedor do `ResendService` (hoje em
`SupportModule`) — exportando-o de lá, sem duplicar a classe.

## O e-mail (`patient-deleted-email.ts`, função pura)

Entrada: `{ patientName, nutritionistName, fileName }`. `nutritionistName` =
`preferredNutritionistName(displayName, user.name)`.

- **Assunto:** `Seus dados no iNutri — cadastro encerrado por {nutritionistName}`
- **Texto (pt-BR, também em HTML simples):**
  - Olá, {primeiro nome}.
  - {nutritionistName} encerrou o seu cadastro no iNutri, e os seus dados foram
    apagados da plataforma. Se você usava o app do iNutri, o acesso também foi
    removido.
  - Em anexo (`{fileName}`) está uma cópia de tudo o que estava salvo sobre
    você: dados de cadastro, anamnese, avaliações físicas, planos alimentares,
    recordatórios, metas, estimativas do Silhueta, consultas, consentimentos,
    transcrições de consultas e registros do diário.
  - O arquivo está em JSON, um formato de texto aberto: pode ser aberto em
    qualquer editor de texto e entregue a outro profissional. Esta cópia
    atende ao seu direito de acesso e portabilidade previsto na LGPD
    (Lei 13.709/2018, art. 18).
  - Guarde o arquivo: depois desta exclusão não é possível recuperar os dados
    pelo iNutri.
  - Dúvidas sobre o encerramento: responda este e-mail para falar com
    {nutritionistName}.
- **Nome do arquivo:** `dados-{slug do nome}-{AAAA-MM-DD}.json`
  (slug sem acentos, minúsculo, hífens).

## Web (`apps/web`)

- `lib/api/patients.ts`: `deletePatient(id, confirmName?)` (DELETE com corpo)
  e `exportPatientData(id)`; `deleteDemoPatient` passa a delegar a
  `deletePatient(id)`.
- `lib/queries/patients.ts`: `useDeletePatient()` invalida `['patients']` e
  remove o cache do paciente.
- `components/patients/delete-patient-dialog.tsx`:
  - Texto: exclusão definitiva de todos os dados (ficha, anamnese, avaliações,
    planos, recordatórios, gravações) e do acesso ao app.
  - Com e-mail: "Enviaremos uma cópia dos dados para {email} antes de excluir."
  - Sem e-mail: "Este paciente não tem e-mail cadastrado. Baixe o arquivo com
    os dados antes de excluir." + botão **Baixar dados** (baixa o JSON como
    arquivo, mesmo nome do anexo).
  - Campo "Digite o nome do paciente para confirmar"; botão **Excluir
    definitivamente** só habilita quando confere (mesma normalização da API).
  - Sucesso → `toast.success('Paciente excluído.')` e `router.push('/patients')`.
  - 502 → `toast.error('Não foi possível enviar o e-mail com os dados; nada foi excluído.')`.
- `patient-detail.tsx`: botão **Excluir paciente** (outline, texto
  destrutivo) no cabeçalho, só quando `canEdit` e o usuário é `NUTRITIONIST`
  (funcionário com `canEdit` não vê). Para paciente demo o fluxo existente de
  Tutoriais continua; o botão aparece também para demo e usa o mesmo diálogo.

## Testes

**API**
- `purgePatient`: apaga filhos + perfil + usuário na transação; remove usuário
  do Supabase, foto e áudios depois; falha de storage não lança.
- `deletePatient`: 404 para paciente de outra nutricionista; demo apaga sem
  e-mail e sem `confirmName`; nome errado → 400 e nada apagado; com e-mail →
  `sendEmail` com anexo JSON (conteúdo = export) e `replyTo` da nutricionista,
  depois purge; envio falha → 502 e purge **não** chamado; sem e-mail → purge
  sem envio.
- `deleteMyAccount` e `deleteDemoPatient` continuam passando (agora via purge).
- `ResendService`: repassa `attachments`.
- `buildPatientDeletedEmail`: assunto, nome da nutricionista, menção ao anexo e à LGPD.
- `GET /patients/:id/export`: posse.

**Web**
- Botão visível só para nutricionista com `canEdit`.
- Excluir desabilitado até o nome conferir; confirma chama `deletePatient(id, nome)`.
- Sem e-mail: mostra o aviso e **Baixar dados** chama `exportPatientData`.
- 502 mostra a mensagem de "nada foi excluído".

## Riscos

- **Irreversível.** A confirmação por nome e o e-mail antes da exclusão são as
  proteções. Sem backup/lixeira nesta entrega.
- **E-mail aceito ≠ entregue.** O Resend aceitar não garante a caixa de
  entrada; o nome do arquivo e o conteúdo ficam só no e-mail. Aceitável.
- **Tamanho do anexo.** JSON de um paciente é pequeno (KB); o limite do Resend
  (40 MB) não é um risco realista.
