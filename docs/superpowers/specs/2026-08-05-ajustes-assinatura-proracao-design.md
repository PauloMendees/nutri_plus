# Ajustes de Assinatura + Upgrade com Proração — Design

**Date:** 2026-08-05
**Branch:** `feat/assinatura-pagamentos` (mesmo PR #54)
**Status:** Approved design — ready for implementation plan

Lote de ajustes pós-teste do fluxo de assinatura. Quatro são acabamento/UX; o quinto (troca de plano com **upgrade prorateado**) é uma feature de billing e fecha o follow-up **I2** parqueado.

## Decisões (do brainstorming)

- **Botões:** usar o `<Button>` compartilhado (shadcn) nos componentes novos — nada de radius ad-hoc.
- **Faturas:** traduzir os enums de status/método pra português.
- **Validade do cartão:** máscara automática `MM/AAAA`.
- **Método de pagamento:** trocar Pix↔cartão pede confirmação num `Dialog`; o form de cartão abre num `Dialog`.
- **Troca de plano:** escopo = **upgrade imediato com proração** (mesmo período, tier↑) + **downgrade/troca de período agendados pro próximo ciclo** (sem reembolso). Upgrade mantém o vencimento e cobra só a diferença pro-rata via cobrança avulsa. Resolve o I2 (concessão só na confirmação do pagamento; downgrade/período promovidos no webhook).

## 1. Ajustes mecânicos (pontos 1, 4, 5)

- **Botões (1):** substituir os `<button>` crus por `<Button>` (`@/components/ui/button`) em `plan-picker.tsx`, `card-form.tsx`, `pix-payment.tsx`, `app/(checkout)/assinatura/page.tsx`, `subscription-tab.tsx`. O `<Button>` já traz `rounded-lg` + altura/hover/foco padrão. Preservar variantes (primário vs outline) e larguras (`w-full` onde aplicável).
- **Faturas PT (4):** no `subscription-tab`, mapear na renderização:
  - status → `CONFIRMED`/`RECEIVED`→"Pago", `PENDING`→"Pendente", `OVERDUE`→"Vencido", `REFUNDED`→"Estornado" (fallback: o próprio valor).
  - método → `PIX`→"Pix", `CREDIT_CARD`→"Cartão", `BOLETO`→"Boleto" (fallback "—").
- **Máscara validade (5):** no `card-form`, o input de validade formata no `onChange` — remove não-dígitos, insere "/" após 2 dígitos, limita a `MM/AAAA` (ex.: `122030` → `12/2030`). O parse `split('/')` continua igual.

## 2. Dialogs de método de pagamento (ponto 3)

No `subscription-tab`:
- Trocar método (Pix↔cartão) abre um **`Dialog` de confirmação** antes de executar ("Mudar para Pix?" / "Trocar para cartão?" com uma linha explicando o efeito — ex.: cartão auto-renova).
- O **form de cartão** (atualizar cartão / trocar pra cartão) abre **dentro de um `Dialog`** (modal), não inline. Usa o `Dialog` do shadcn (`@/components/ui/dialog`, já existe — sem dep nova). Sucesso → fecha o dialog + `refetch`.

## 3. Troca de plano + upgrade prorateado (ponto 2)

**Página `/assinatura` para assinante ATIVO:**
- Remover o auto-redirect quando `active` (hoje `useEffect` manda pra `/`). A tela "assinatura ativa" só aparece após concluir uma troca **nesta sessão** (estado local `done`), não na entrada.
- O assinante ativo vê o **PlanPicker** com o **plano atual destacado** ("Seu plano atual", + vencimento em dd/mm). Mesmo plano+período = botão desabilitado.

**Regra de decisão ao escolher outro plano:**
- `mesmo período` **e** `tier↑` (Essencial→Pro) → **upgrade imediato pro-rata**.
- senão (downgrade Pro→Essencial, ou troca de período mensal↔anual) → **agendado pro próximo ciclo**.

**Upgrade imediato (pro-rata):**
- `diasRestantes = ceil((currentPeriodEnd − hoje)/dia)`; `diasCiclo = 30 (mensal) | 365 (anual)`.
- `diff = arred2((valorNovo − valorAtual) × diasRestantes / diasCiclo)` (valores do `PLAN_CATALOG`).
- Cria uma **cobrança avulsa** no Asaas (`POST /payments`, one-time) de `diff` no **método atual** (`sub.paymentMethod`):
  - **Cartão** → cobra na hora com o token salvo (síncrono) → aplica upgrade agora. *(Assinante de cartão legado sem `asaasCardToken`: reabre o `card-form` pra capturar o cartão da diferença — raro; novas assinaturas já guardam o token.)*
  - **Pix** → devolve o QR da diferença → cliente paga → **webhook** aplica o upgrade.
- Aplicar upgrade = `updateSubscriptionValue` no Asaas pro valorNovo (ciclos futuros já saem no valor novo) + seta `plan`=novo, **mantendo o `currentPeriodEnd`**. UI: "Você paga R$ X agora; seu vencimento continua dd/mm".

**Downgrade / troca de período (próximo ciclo, sem cobrança agora):**
- `updateSubscriptionValue` (novo valor + `cycle` se mudou período) → próxima cobrança já no plano novo; guarda `pendingPlan`/`pendingBillingPeriod`. O `plan` atual **continua** até `currentPeriodEnd`; no próximo `PAYMENT_CONFIRMED`, o webhook promove `pendingPlan`→`plan`. UI: "Passa a valer em dd/mm".

**Novo assinante (trial):** **inalterado** — checkout normal (preço cheio), sem proração (não pagou nada ainda). A troca de plano de um ativo **deixa de fazer cancelar+recriar**.

## Modelo de dados (migração aditiva)

```prisma
Subscription += pendingPlan          PlanTier?       // agendado (downgrade/período) ou upgrade-Pix pendente
Subscription += pendingBillingPeriod BillingPeriod?
Subscription += pendingChargeAsaasId String?         // cobrança avulsa de upgrade (Pix) → webhook aplica
Subscription += asaasCardToken       String?         // token do cartão salvo, p/ cobrar a diferença
```
Não guardamos `value` — valorAtual/novo vêm do `PLAN_CATALOG`.

## AsaasService (novos métodos)

- `createOneOffCharge({ customerId, value, billingType, description, creditCardToken? }) → { paymentId, pixQrCode? }` — `POST /payments` avulso. Cartão usa `creditCardToken` (cobra na hora); Pix retorna `{ paymentId, pixQrCode }`. Recusa de cartão → 422 (mesmo padrão do checkout).
- `updateSubscriptionValue(subscriptionId, { value, cycle? }) → void` — `POST /subscriptions/{id}`.
- `createCardSubscription`/`updateSubscriptionBilling` passam a **retornar/gravar** o `creditCardToken` (`asaasCardToken`).

## Endpoints

- **`POST /v1/me/subscription/change-plan`** *(novo)* (`@Roles(NUTRITIONIST)`, `@BillingExempt`) body `{ plan, period }`. Exige `status===ACTIVE` + `asaasSubscriptionId`. Resposta união:
  - `{ kind: 'UPGRADE', method: 'PIX', pixQrCode, amount }`
  - `{ kind: 'UPGRADE', method: 'CREDIT_CARD', status: 'ACTIVE' | 'PENDING', amount }`
  - `{ kind: 'SCHEDULED', effectiveDate }` (ISO)
- **Webhook (`handleWebhook` estendido):**
  1. `payment.id === sub.pendingChargeAsaasId` e confirmado → **aplica upgrade** (`updateSubscriptionValue` + `plan=pendingPlan` + limpa pending + grava a fatura). *(Cobrança avulsa não tem `payment.subscription` — tratar isto ANTES do early-return `if (!p.subscription) return`.)*
  2. Senão, pagamento regular do ciclo confirmado com `pendingPlan` setado (agendado, sem `pendingChargeAsaasId`) → **promove** `pendingPlan→plan`, limpa pending, ACTIVE + `currentPeriodEnd`.
  3. Senão → comportamento atual (`ACTIVE`+`currentPeriodEnd` / `PAST_DUE` / `CANCELED`).

shared-types: `ChangePlanRequest { plan; period }`; `ChangePlanResponse` (união acima); helper de proração pode viver no server (não precisa em shared-types).

## Testes

- **API (jest):** proração — `diff` pro-rata (mensal/anual, dias restantes); upgrade cartão síncrono aplica (updateSubscriptionValue + plan, mantém currentPeriodEnd); upgrade Pix guarda `pendingChargeAsaasId`+QR e **não** muda plan até o webhook; webhook do diff aplica (id === pendingChargeAsaasId); downgrade/período agenda (pendingPlan set, sem cobrança) e o próximo `PAYMENT_CONFIRMED` promove; `change-plan` rejeita trial/sem-subscription. `AsaasService.createOneOffCharge`/`updateSubscriptionValue` (mock fetch; cartão usa token; recusa→422). Cartão/token nunca logado.
- **Web (vitest):** botões usam `<Button>` (radius consistente); faturas mostram labels PT; máscara de validade formata `MM/AAAA`; dialog de confirmação de troca de método + card-form em dialog; picker mostra "Seu plano atual" e destaca; upgrade exibe valor pro-rata + "vencimento continua dd/mm"; downgrade/período exibe "vale em dd/mm"; não rebate mais o assinante ativo pra `/`.
- **shared-types** build; **mobile** intocado.

## Restrições globais

- Migração **aditiva** (`pendingPlan`, `pendingBillingPeriod`, `pendingChargeAsaasId`, `asaasCardToken`). shared-types reconstruído.
- **Sem dependência nova** (Dialog shadcn já existe; QR via `<img>`). pt-BR.
- **PCI:** só `cardLast4`/`cardBrand`/`asaasCardToken` (token), nunca o PAN; nunca logar cartão.
- Proração só quando `status===ACTIVE`; trial usa o checkout normal. Troca de plano de ativo **não** faz cancelar+recriar.
- Cliente pagante = `NutritionistProfile`; paciente/mobile **inalterados**.
- Self-serve `@Roles(NUTRITIONIST)` + `@BillingExempt`.
- Mesma branch `feat/assinatura-pagamentos` (mesmo PR #54). Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** abrir novo PR. Verificar por área: shared-types build; API test+tsc; web test+tsc; mobile tsc (não deve ripar).

## Mapa de arquivos (grupos naturais de tarefa)

1. **Mecânicos web:** `<Button>` nos componentes novos; labels PT de faturas; máscara de validade (`card-form`, `subscription-tab`, `plan-picker`, `pix-payment`, `(checkout)/assinatura/page`).
2. **Dialogs de método:** `subscription-tab` (confirmação + card-form em `Dialog`).
3. **Modelo + shared-types:** 4 campos em `Subscription` + migração; `ChangePlanRequest`/`ChangePlanResponse`.
4. **AsaasService:** `createOneOffCharge`, `updateSubscriptionValue`, gravar `asaasCardToken`.
5. **SubscriptionService.changePlan + endpoint + webhook estendido** (proração/agendamento) + specs.
6. **Web troca de plano:** página `/assinatura` (sem auto-redirect; plano atual destacado; upgrade pro-rata vs agendado; usa o client `changePlan`).
