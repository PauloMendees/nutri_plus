# Análise de mercado, precificação e gateway — nutri_plus

**Data:** 2026-07 · **Escopo:** Brasil (BRL), alvo nutricionista solo, paciente usa de graça, posicionamento competitivo **e** lucrativo, com trial de 7 dias.

> Valores de concorrentes e taxas mudam com frequência — **confirmar nas páginas oficiais** antes de fixar. USD convertido a ~R$5,5.

## TL;DR

1. **Gateway → Asaas.** Sem mensalidade, Pix com taxa fixa (R$1,99; ~grátis nos 3 primeiros meses), cartão 2,99% + R$0,49, recorrência nativa, API REST + webhooks boa para NestJS. Vice: Stripe (melhor DX/Billing, porém mais caro e Pix invite-only para empresa BR).
2. **Preço → 2 planos com 7 dias grátis:** Essencial R$59/mês (R$590/ano) e Pro R$97/mês (R$970/ano). Margem ~70–85%.
3. **Feature antes de lançar → banco TACO + macros por alimento** (maior lacuna vs. Dietbox/WebDiet), + calculadoras GET/TMB + LGPD mínimo.

## (1) Gateways

| Gateway | Cartão | Pix | Boleto | Mensalidade | Recorrência + trial | DX (NestJS) |
|---|---|---|---|---|---|---|
| **Asaas** ✅ | ~2,99% + R$0,49 | **R$1,99 fixo** (R$0,99 nos 3 primeiros meses) | ~R$1,99 | **Não** | Nativa; trial = 1ª cobrança em D+7 | REST + webhooks, boa |
| Stripe BR | ~3,5–3,99% + R$0,39 | invite-only p/ empresa BR | não nativo | Não | Billing (trial/dunning nativos) | Excelente |
| Pagar.me | ~3,99% | sim | sim | Não | sim | Boa (Stone) |
| Mercado Pago | ~4,99% | barato | sim | Não | API menos polida | Média |
| Iugu / Vindi | negociável | sim | sim | Frequente taxa de plataforma | Especialistas (enterprise) | Boa (overkill p/ solo) |

**Recomendação: Asaas.** Sem custo fixo, Pix barato/previsível, recorrência + tokenização prontas. Trial 7 dias: tokenizar cartão no cadastro + assinatura com `nextDueDate = hoje+7`. Cartão no trial (converte melhor); Pix como opção no anual.

**Nota IAP:** cobrança do nutricionista é **pelo web** → não paga os 30% da Apple/Google (IAP só valeria se o paciente comprasse dentro do app). Manter billing no web.

## (2) Preço

**Concorrentes (2026):**

| Software | Mensal | Anual (≈/mês) | Trial | Observação |
|---|---|---|---|---|
| Dietbox (líder) | ~R$91,90 | ~R$919 (~R$76) | 30 dias | App do paciente |
| WebDiet | ~R$94,90 (Premium) | + Pix no periódico | — | Plano Black: "Clara IA" + **Body3D** (≈ Silhueta) |
| Nutrium | a partir de ~R$25; "Acompanhamento" ~R$60 | ~R$480–720 | plano grátis | Barato/internacional |
| Avanutri / DietPro | ~R$40–60 (ou licença) | — | — | Legado/desktop |

Faixa solo: **~R$40–95/mês**; líderes ~R$90 no mensal.

**Estrutura recomendada (2 planos, 7 dias grátis):**

| Plano | Mensal | Anual (~2 meses grátis) | Inclui |
|---|---|---|---|
| **Essencial** | **R$59** | **R$590** (~R$49/mês) | Pacientes ilimitados, planos (editor + banco de alimentos), bioimpedância + evolução, agenda, app do paciente, PDF. IA de plano até ~30 gerações/mês. Sem Silhueta. |
| **Pro** | **R$97** | **R$970** (~R$81/mês) | Tudo + IA ilimitada + Silhueta + contabilidade. |

**Margem (por que é lucrativo):**
- IA por operação (OpenAI 2026): plano no modelo *fast* (gpt-4o-mini $0,15/$0,60; GPT-5.6 "Luna" $1/$6 por 1M) ≈ R$0,02–0,15; no *smart* ($2,50/$15) ≈ R$0,40. Silhueta (visão, 2–3 imagens) ≈ R$0,09. 100 gerações/mês ≈ R$2–15 (fast) a ~R$40 (smart, pior caso).
- Gateway: ~R$1,99 (Pix) a ~R$2,85 (cartão) por cobrança. Infra (Supabase): centavos por assinante ativo.
- Pro R$97 → margem ~R$50–74 (55–75%). Essencial R$59 com IA capada → ~80%.
- Proteções: modelo *fast* como padrão na geração; cap de IA no Essencial; Silhueta só no Pro. Lembrar do Simples Nacional (~6%).

## (3) Features pré-lançamento

| Recurso esperado no BR | Concorrentes | nutri_plus | Prioridade |
|---|---|---|---|
| Banco TACO + macros por alimento | ✅ | ⚠️ (editor texto/kcal, sem base+macros) | **Construir agora** |
| Calculadoras GET/TMB + metas de macros | ✅ | ❌ (só IMC) | **Construir agora** |
| Consentimento/LGPD + política | ✅ | parcial (só Silhueta) | **Construir agora** |
| Anamnese + recordatório 24h | ✅ | ❌ | Fast-follow |
| Lembretes/push ao paciente | parcial | ❌ | Fast-follow |
| Assinatura digital / marca no PDF | ✅ | parcial (logo) | Adiar |
| Autoagendamento do paciente | alguns | ❌ | Adiar |
| Cobrança dos pacientes pelo nutri | alguns | ❌ (só contabilidade) | Adiar (via Asaas depois) |

**Shortlist:** (1) banco TACO + macros por alimento; (2) calculadoras GET/TMB + metas; (3) LGPD mínimo (consentimento + política + export/exclusão). Anamnese/recordatório e push: fast-follow.

## Fontes

- Planos Dietbox — https://pay.dietbox.me/
- WebDiet Assine — https://pt.webdiet.com.br/assine.php
- Nutrium (GetApp) — https://www.getapp.com/healthcare-pharmaceuticals-software/a/nutrium/
- Asaas — Preços e taxas — https://www.asaas.com/precos-e-taxas
- Stripe — Pricing — https://stripe.com/pricing
- Stripe Pix (BR) — https://stripe.com/br/payment-method/pix
- OpenAI API Pricing — https://developers.openai.com/api/docs/pricing
