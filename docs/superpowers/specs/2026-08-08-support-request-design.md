# Suporte no sidebar + e-mail via Resend — Design

**Date:** 2026-08-08  
**Branch:** `feat/support-request-dialog`  
**Status:** Approved

## Goal

Permitir que nutricionistas/funcionários abram um pedido de suporte a partir do dashboard web, com e-mail enviado à caixa de suporte via Resend.

## UX

- Item **Suporte** no footer do sidebar, acima do bloco nome/avatar.
- Ícone Lucide `LifeBuoy`.
- Clique abre dialog (não navega).
- Campos:
  1. E-mail para retorno (pré-preenchido com `me.email`, editável)
  2. Categoria (select)
  3. Descrição (textarea, mín. 20 chars)
- Botões `rounded-full`: Cancelar / Enviar; toast de sucesso/erro.

### Categorias

| value | label (pt-BR) |
|-------|----------------|
| `BILLING` | Pagamento / cobrança |
| `LOGIN` | Problemas para entrar / conta |
| `SUBSCRIPTION` | Assinatura / planos |
| `BUG` | Bug / erro no sistema |
| `SUGGESTION` | Sugestão |
| `OTHER` | Outros |

## API

`POST /v1/support` — autenticado, roles `NUTRITIONIST` | `EMPLOYEE`, `@BillingExempt` (read-only ainda pode pedir ajuda).

Body: `{ replyTo: string; category: SupportCategory; description: string }`  
Response: `{ ok: true }`

## E-mail (Resend)

- Destino: `SUPPORT_INBOX_EMAIL`
- From: `SUPPORT_FROM_EMAIL`
- Auth: `RESEND_API_KEY`
- Subject: `[iNutri Suporte] {label} — {nome}`
- `reply_to`: e-mail do form
- Corpo: categoria, descrição, replyTo, nome, role, userId, timestamp

## Env (API, opcionais no boot)

- `RESEND_API_KEY`
- `SUPPORT_INBOX_EMAIL`
- `SUPPORT_FROM_EMAIL`

Se faltar no envio → 503. Falha Resend → 502.

## Out of scope

Tickets, anexos, rate limit avançado, e-mail de confirmação ao usuário.
