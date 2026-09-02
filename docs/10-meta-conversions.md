# Rastreamento de conversões do Meta (Pixel + Conversions API)

Pixel `1633275874982739`. Antes desta mudança todos os eventos tinham
integração **"Navegador"** apenas, sem deduplicação. Agora cada conversão sai
pelos dois caminhos com o mesmo `event_id`, e o Gerenciador de Eventos deve
mostrar **"Navegador e servidor"**.

## Por que deduplicar

Sem `event_id` compartilhado, o Meta conta a mesma conversão duas vezes: o CAC
calculado sai pela metade do real e a campanha otimiza para o alvo errado.

## Eventos

| Evento | Navegador | CAPI | Onde dispara |
| --- | --- | --- | --- |
| `PageView` | ✅ | — | `MetaPixel` na landing, auth e checkout |
| `CompleteRegistration` | ✅ | ✅ | submit do cadastro (`signup-form.tsx`) |
| `StartTrial` | ✅ | ✅ | botão "Começar teste grátis" (`/assinatura`) |
| `InitiateCheckout` | ✅ | ✅ | escolha de plano (`/assinatura`) |
| `Subscribe` | ✅ | ✅ | Pix confirmado ou cartão aprovado |
| `TrialAtivado` | ✅ | ✅ | ≥1 paciente **E** ≥1 plano alimentar, uma vez por usuário |

`PageView` fica só no navegador de propósito: volume alto e nenhum valor de
otimização server-side.

## Como o `event_id` chega ao backend

Em **headers**, não no corpo:

```
x-meta-event-id     UUID gerado uma vez no cliente (crypto.randomUUID)
x-meta-fbp          cookie _fbp
x-meta-fbc          cookie _fbc (ou derivado de ?fbclid=)
x-meta-source-url   window.location.href → event_source_url
```

Três motivos:

1. O `ValidationPipe` global roda com `forbidNonWhitelisted: true`. Um campo de
   analytics em qualquer DTO de domínio devolveria **400** — seria preciso
   editar todo DTO que pudesse originar conversão.
2. `POST /me/subscription/start-trial` não tem corpo nenhum. Header vale para
   qualquer rota, com ou sem body.
3. O mesmo mecanismo serve para eventos futuros sem tocar em contrato de
   domínio. Marketing não vaza para dentro dos DTOs do produto.

Os nomes ficam em `META_HEADERS` (`packages/shared-types/src/v1/meta.ts`), fonte
única para os dois lados.

## Arquitetura

```
navegador                          API (NestJS)                    Meta
─────────                          ────────────                    ────
fbq('track', E, {}, {eventID}) ──────────────────────────────────► Pixel
POST /v1/signals      (público)  ─► MetaSignalsService ─► MetaCapiService ─► CAPI
POST /v1/me/signals   (autenticado)                        (mesmo event_id)
```

- **`POST /v1/signals`** — público, allowlist de **um** evento
  (`CompleteRegistration`). Existe porque o cadastro acontece antes da
  confirmação de e-mail: não há sessão para exigir Bearer. Não aceita valor
  monetário, então o pior abuso possível suja volume, nunca receita atribuída.
- **`POST /v1/me/signals`** — autenticado. O e-mail do `user_data` vem da
  sessão, **nunca** do corpo.

Os paths são neutros (`/signals`, não `/meta/events`) porque bloqueadores de
anúncio filtram por padrões no caminho da URL.

### Valor de `Subscribe`

`value` é sempre derivado no servidor: `MetaSignalsService` relê
`Subscription.plan` / `billingPeriod` no banco e converte pelo `PLAN_CATALOG`.
O cliente também manda `plan`/`period`, mas só como fallback quando a assinatura
ainda não gravou — um corpo forjado não consegue inflar a conversão. `StartTrial`
vai com `value: 0` de propósito: a campanha otimiza pelo evento, não pelo valor.

### `TrialAtivado`

Condição: **≥1 paciente E ≥1 plano alimentar**, em qualquer ordem, possivelmente
em requisições diferentes. Por isso a checagem **conta no banco** em vez de
observar o que acabou de acontecer na requisição.

Disparo único garantido por `Subscription.trialAtivadoEm`, reivindicado por um
`updateMany` condicional (`where: { trialAtivadoEm: null }`): só o primeiro
recebe `count === 1`. Duas abas concorrentes não emitem duas vezes.

A ordem no cliente é invertida: o front chama o relay **primeiro** e só dispara
`fbq('trackCustom', ...)` se a resposta vier `{ fired: true }` — o servidor é a
autoridade. Os hooks `useCreatePatient` e `useCreateMealPlan` chamam o relay em
`onSuccess`, cobrindo as duas ordens.

Pacientes/planos de demonstração do tour de onboarding **não contam**: são
criados pelo produto, não pela pessoa, e contá-los dispararia o evento para
quase todo mundo que abre o tour.

O caminho de IA (`createGeneratedPlan`) roda dentro de um job em segundo plano,
muito depois do `202` — não há navegador para fornecer um `event_id`. Lá a
ativação é avaliada no próprio serviço e o evento sai **só pelo servidor**
(contado uma vez; deduplicação só é necessária quando os dois lados disparam).

O pixel entra no shell autenticado com `<MetaPixel trackPageView={false} />`:
inicializa para o `trackCustom` ter onde disparar, sem inflar PageView com a
navegação interna do produto.

### Robustez

`MetaCapiService.enqueue()` é fire-and-forget com log e timeout de 5s. Falha de
rede, token inválido ou Graph fora do ar nunca propagam: **ninguém perde um
cadastro porque o Meta caiu**. `MetaActivationService.evaluate()` engole erro de
banco pelo mesmo motivo.

Sem `META_PIXEL_ID` + `META_CAPI_ACCESS_TOKEN` o serviço vira no-op silencioso —
dev e testes rodam sem nenhuma variável do Meta.

## Variáveis de ambiente

`apps/api/.env` (ver `.env.example` e `render.yaml`):

```
META_PIXEL_ID=1633275874982739
META_CAPI_ACCESS_TOKEN=          # Gerenciador de Eventos. NUNCA commitar.
META_CAPI_TEST_EVENT_CODE=       # opcional, só em dev
META_CAPI_API_VERSION=           # opcional, default v21.0
```

`apps/web/.env`: `NEXT_PUBLIC_META_PIXEL_ID=1633275874982739`. O **token nunca**
vai para o front — não tem prefixo `NEXT_PUBLIC_` de propósito.

## Acrescentar um evento customizado novo

O "aha moment" previsto no plano de marketing ainda não tem definição de qual
ação do usuário representa, então **não foi implementado**. Quando tiver:

1. Somar o nome a `META_CUSTOM_EVENTS` em
   `packages/shared-types/src/v1/meta.ts`. O DTO, a allowlist do relay e a
   tipagem passam a aceitá-lo automaticamente.
2. Chamar `trackConversion` (ou um wrapper como
   `trackTrialAtivadoIfReady`, se precisar de guarda de disparo único) no ponto
   do produto onde a ação acontece.

Nenhuma mudança de infraestrutura: rota, headers, hashing, dedup e
fire-and-forget já valem para o evento novo.

## Como validar

Critério de aceite: no Gerenciador de Eventos, a integração de cada evento
mudar de "Navegador" para **"Navegador e servidor"**, com o Meta indicando
deduplicação. Enquanto aparecer só "Navegador", não está pronto.

### 1. Preparação

```bash
pnpm --filter @nutri-plus/api db:migrate    # cria Subscription.trialAtivadoEm
```

Em `apps/api/.env`, preencha `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN` e
`META_CAPI_TEST_EVENT_CODE` (Gerenciador de Eventos → **Eventos de teste** →
copiar o código `TEST#####`). Em `apps/web/.env.local`, confirme
`NEXT_PUBLIC_META_PIXEL_ID`.

> Com `META_CAPI_TEST_EVENT_CODE` preenchido os eventos vão para a aba
> "Eventos de teste" e **não** sujam os dados de produção. Deixe **vazio** em
> produção.

### 2. Verificação de domínio

```bash
pnpm --filter @nutri-plus/web build
grep -o '<meta name="facebook-domain-verification"[^>]*>' apps/web/.next/server/app/index.html
```

Precisa aparecer no HTML — se só existisse via JS no cliente, o crawler do Meta
(que não executa JS) falharia a verificação. Em produção:
`curl -s https://inutri.life | grep facebook-domain-verification`.

### 3. Cadastro real de ponta a ponta

Com a aba **Eventos de teste** aberta e a extensão **Meta Pixel Helper**
instalada, percorra:

1. `/signup` → criar conta → **CompleteRegistration**
2. confirmar o e-mail → `/assinatura`
3. "Começar teste grátis" → **StartTrial**
4. escolher um plano → **InitiateCheckout**
5. pagar (Pix ou cartão) → **Subscribe**
6. cadastrar 1 paciente e criar 1 plano alimentar → **TrialAtivado**

Para cada evento, confira nos Eventos de teste que aparecem as **duas** origens
(Navegador + Servidor) e que o Meta marca como **deduplicado**. No Pixel Helper,
o `eventID` do navegador tem de bater com o `event_id` do lado servidor.

Na aba Network do navegador: as chamadas `POST /v1/signals` e
`POST /v1/me/signals` levam o header `x-meta-event-id` com o mesmo UUID do
`eventID` que foi para o `fbq`.

### 4. Disparo único de `TrialAtivado`

```sql
SELECT "trialAtivadoEm" FROM "Subscription" WHERE "nutritionistId" = '<id>';
```

Depois de preencher, criar mais pacientes/planos **não** pode disparar de novo:
`POST /v1/me/signals {"name":"TrialAtivado"}` passa a responder
`{"fired": false}` e nenhum evento novo aparece no Gerenciador.

Teste as duas ordens em contas diferentes (paciente→plano e plano→paciente) e
confirme que ambas disparam.

### 5. Resiliência

Com um `META_CAPI_ACCESS_TOKEN` inválido, o cadastro, o checkout e a criação de
plano precisam continuar funcionando normalmente — só um `WARN` no log da API.

### 6. Produção

Depois do merge, **esvazie** `META_CAPI_TEST_EVENT_CODE` no painel do Render.
Em 20–30 minutos o Gerenciador de Eventos deve mostrar "Navegador e servidor"
nos quatro eventos de conversão e no `TrialAtivado`.
