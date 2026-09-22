# Step 12 - E-mails de ciclo de vida (rotina diária)

Rotina diária que dispara, no máximo uma vez por nutricionista, e-mails transacionais para momentos do funil onde a pessoa provavelmente travou. Segue o mesmo padrão dos lembretes de consulta (`notifications/reminders.service.ts`): GitHub Actions agendado faz `POST` num endpoint interno da API protegido por segredo.

## As três regras

1. **`TRIAL_NO_PATIENT`** — trial ativo há 3 dias ou mais e nenhum paciente cadastrado. Elegível quando `Subscription.status = 'TRIALING'`, `trialEndsAt` ainda não venceu mas já se passaram pelo menos 3 dos `TRIAL_DAYS` do trial, `isComp = false`, e o nutricionista não tem nenhum `PatientProfile` real (`isDemo = false`).
2. **`CHECKOUT_ABANDONED`** — gerou uma cobrança e não pagou, um dia depois. Elegível quando `Subscription.status = 'PAST_DUE'`, `onboardedAt` foi marcado há pelo menos 1 dia, e nenhum `SubscriptionPayment` da assinatura tem `paidAt` preenchido. Se a conta chegou ao checkout sem nunca ter passado pelo trial (`trialEndsAt` nulo), o e-mail é enviado do mesmo jeito, só que sem a data: a frase de acesso vira "Se preferiu não assinar agora, tudo bem: este é o único lembrete que enviamos." em vez de citar "seu acesso segue até {data}".
3. **`TRIAL_NOT_STARTED`** — criou conta mas nunca ativou o teste. Elegível quando `Subscription.trialEndsAt` é nulo, `isComp = false`, a conta (`nutritionist.user.createdAt`) foi criada há 1 dia ou mais, e nenhum e-mail `TRIAL_NOT_STARTED` foi enviado ainda para aquele nutricionista. Sem `trialEndsAt`, essas contas ficam em modo somente leitura e não são alcançadas por `TRIAL_NO_PATIENT` (que exige `trialEndsAt` não nulo) — este é o único lembrete que chega a elas.

Contas de teste do dono não são excluídas por código (não há como distinguir); ele recebe também, e isso é aceitável.

## Envio único

Cada elegibilidade é decidida por uma consulta Prisma com `none` sobre a tabela `LifecycleEmail` (`@@unique([nutritionistId, kind])`): a rotina só grava uma linha ali **depois** que `ResendService.sendEmail` retorna com sucesso, então uma falha de envio não marca nada e o destinatário volta a ser elegível na próxima execução. Uma falha ao enviar para um destinatário não interrompe o lote: fica um `logger.warn` e a rotina segue para o próximo.

Sem `SUPPORT_FROM_EMAIL`/`SUPPORT_INBOX_EMAIL` configurados, a rotina não consulta nada e retorna zeros (mesmo padrão de fail-safe do resto do envio de e-mail transacional).

## Endpoint

`POST /v1/internal/lifecycle-emails/dispatch`, `@Public()` + `@ApiExcludeEndpoint()`, protegido pelo header `x-reminder-key` comparado a `REMINDER_DISPATCH_KEY` (reaproveita o segredo dos lembretes de consulta — fail-closed: sem segredo configurado, a rota nunca abre). Retorna `{ trialNoPatient: { eligible, sent }, checkoutAbandoned: { eligible, sent }, trialNotStarted: { eligible, sent } }`.

## Workflow

`.github/workflows/lifecycle-emails.yml`, cron `0 12 * * 1-5` (09:00 em Brasília, segunda a sexta — fim de semana não vale a pena para este público, e quem ficou elegível no sábado recebe na segunda, já que o envio único não perde nem duplica). Para disparar à mão: aba **Actions** do repositório → **Dispatch lifecycle emails** → **Run workflow**.

## Adicionar um novo tipo

1. Enum `LifecycleEmailKind`: adicionar o novo valor (migration à mão, `ALTER TYPE ... ADD VALUE`).
2. `lifecycle-email-templates.ts`: nova função `build<Nome>Email(...)` que devolve `{ subject, text, html }`, testada em `lifecycle-email-templates.spec.ts`.
3. `lifecycle-emails.service.ts`: novo método privado `dispatch<Nome>` com a consulta Prisma de elegibilidade (sempre com `lifecycleEmails: { none: { kind: '<NOVO_KIND>' } }` na condição), chamado a partir de `dispatch()` e somado ao resultado.
