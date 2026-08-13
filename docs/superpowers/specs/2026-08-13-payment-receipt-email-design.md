# E-mail de confirmação de pagamento (boas-vindas + recibo) — Design

**Date:** 2026-08-13
**Branch:** `feat/payment-receipt-email` (off main)
**Status:** Approved design — ready for implementation plan

Quando o Asaas confirma um pagamento da assinatura do nutricionista, a API envia um e-mail transacional via Resend: tom de **boas-vindas** na primeira ativação e tom de **recibo** nas renovações. O pagamento nunca espera o e-mail.

## Decisões (do brainstorming)

- Dispara em **todo** `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` da nossa assinatura.
- Primeiro pagamento (status anterior ≠ `ACTIVE`) = boas-vindas + recibo; já `ACTIVE` = só confirmação.
- Envio **best-effort**: falha de Resend ou env ausente não quebra o webhook nem desfaz o `ACTIVE`.
- Idempotente por fatura (`receiptEmailSentAt` em `SubscriptionPayment`).
- Reusa Resend + `SUPPORT_FROM_EMAIL`. Sem fila, sem PDF, sem remetente novo.

## Trigger

Só no `SubscriptionService.handleWebhook`, depois do upsert do pagamento e da transição de status que já existem.

| Evento Asaas | Envia e-mail? |
|---|---|
| `PAYMENT_CONFIRMED` | Sim, se a fatura ainda não tem `receiptEmailSentAt` |
| `PAYMENT_RECEIVED` | Sim, mesma regra |
| `PAYMENT_OVERDUE` | Não |
| `PAYMENT_REFUNDED` | Não |
| Qualquer outro / sem `payment.subscription` / assinatura desconhecida | Não (no-op como hoje) |

Ordem no handler:

1. Resolver a assinatura por `asaasSubscriptionId`, incluindo `nutritionist.user` (`name`, `email`).
2. Guardar `previousStatus = sub.status`.
3. Upsert de `SubscriptionPayment` + update de status (`ACTIVE` / `PAST_DUE` / `CANCELED`) — comportamento atual inalterado.
4. Se o evento **não** for `PAYMENT_CONFIRMED` nem `PAYMENT_RECEIVED`, return.
5. Usar o registro retornado pelo upsert. Se `receiptEmailSentAt` já está preenchido, return.
6. Montar e enviar o e-mail (`try/catch`). Sucesso → `update` só de `receiptEmailSentAt = now()`. Falha → `Logger.warn`, **não** relança.

O controller do webhook continua respondendo `{ ok: true }` com HTTP 200 em todos esses caminhos.

## Tom

| `previousStatus` | Variante | Assunto |
|---|---|---|
| `TRIALING`, `PAST_DUE`, `CANCELED` | `welcome` | `Bem-vindo ao iNutri — assinatura {Essencial\|Pro} ativada` |
| `ACTIVE` | `renewal` | `Pagamento confirmado — iNutri {Essencial\|Pro}` |

Se `plan` for `null` no momento do envio, o rótulo cai para `sua assinatura` e o assunto omite o tier (`Bem-vindo ao iNutri — assinatura ativada` / `Pagamento confirmado — iNutri`).

## Conteúdo

Destinatário: `nutritionist.user.email`.  
From: `SUPPORT_FROM_EMAIL` (já no env, ex. `iNutri Suporte <suporte@inutri.life>`).  
Sem `reply_to`.  
HTML simples + texto puro. Sem anexo.

Campos do corpo (as duas variantes):

- Nome do nutricionista
- Plano (`Essencial` / `Pro`)
- Período (`mensal` / `anual`)
- Valor (`p.value` do Asaas, formatado `pt-BR`, ex. `R$ 99,00`)
- Próximo vencimento (`currentPeriodEnd` já calculado no handler, formatado `pt-BR`)
- CTA para `WEB_ORIGIN` (origem do dashboard; já é env obrigatória)

`welcome` abre com cumprimento e “sua assinatura está ativa”.  
`renewal` abre com “recebemos o pagamento da sua renovação”. Sem “bem-vindo” de novo.

## Componentes

Nenhuma rota HTTP nova. Nenhuma mudança na web/mobile.

### `SubscriptionPayment.receiptEmailSentAt DateTime?`

Nulo = ainda não enviamos (ou a última tentativa falhou). Preenchido só após Resend 2xx.

### `ResendService`

Generalizar para um método único:

```ts
sendEmail(input: {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<void>
```

`sendSupportEmail` vira wrapper fino que chama `sendEmail` (suporte continua texto + `reply_to`). Sem dependência npm nova: o `fetch` para `https://api.resend.com/emails` permanece.

Exportar `ResendService` em `SupportModule` e importar `SupportModule` em `BillingModule`. Sem módulo de mailer novo.

### Mailer de recibo

Função/classe pequena no billing (ex. `payment-receipt-email.ts`) que recebe `{ variant, name, email, plan, period, amount, periodEnd, dashboardUrl }` e devolve `{ subject, text, html }`. Sem I/O. Fácil de testar o copy.

`handleWebhook` chama `ResendService.sendEmail` com esse payload + `SUPPORT_FROM_EMAIL`. Se `RESEND_API_KEY` ou `SUPPORT_FROM_EMAIL` faltar, `sendEmail` lança (como hoje no suporte) e o `try/catch` do webhook trata como falha best-effort.

## Erros

| Situação | Assinatura | Pagamento | `receiptEmailSentAt` | Resposta Asaas |
|---|---|---|---|---|
| Resend 2xx | `ACTIVE` | upsert ok | agora | 200 |
| Resend 4xx/5xx / rede | `ACTIVE` | upsert ok | `null` | 200 |
| `RESEND_API_KEY` ou from ausente | `ACTIVE` | upsert ok | `null` | 200 |
| Reenvio do mesmo `asaasPaymentId` já marcado | sem mudança | sem mudança | intacto | 200 |
| Assinatura desconhecida | no-op | no-op | — | 200 |

Não há retry interno neste slice. Um reenvio *do Asaas* no mesmo pagamento ainda sem `receiptEmailSentAt` tenta de novo — isso é desejável.

## Testes

**`subscription-webhook.spec` (estender):**

- `TRIALING` + `PAYMENT_CONFIRMED` → mailer `welcome` + `receiptEmailSentAt` setado.
- Já `ACTIVE` + `PAYMENT_RECEIVED` → mailer `renewal`.
- Mesmo `asaasPaymentId` com `receiptEmailSentAt` preenchido → mailer **não** chamado.
- Mailer lança / env ausente → `update` de status `ACTIVE` mesmo assim; `receiptEmailSentAt` não é setado; handler não relança.
- `PAYMENT_OVERDUE` → mailer não chamado.

O spec atual mocka `prisma` + `asaas`. Passar um `resend` mock (e `config` se o service precisar do from/origin) no construtor; os testes antigos de transição de status continuam válidos.

**`payment-receipt-email` (novo):** assuntos, rótulos de plano/período, formatação BRL, presença do CTA, diferença welcome vs renewal.

**`resend.service.spec`:** `sendEmail` inclui `html` quando passado e omite `reply_to` quando ausente; `sendSupportEmail` ainda manda `reply_to` + texto.

## Fora de escopo

- Fila / retry / outbox
- PDF de recibo
- E-mail para funcionário ou paciente
- Nova env de remetente
- UI “reenviar recibo”
- Eventos `SUBSCRIPTION_*` do Asaas
- Mudança no painel/webhooks do Asaas
