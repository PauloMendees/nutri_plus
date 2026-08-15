# Configuração de Confirmação de E-mail no Supabase

## Overview

Este documento explica como configurar o fluxo de auto-login pós-confirmação de e-mail no Supabase Auth. Quando um usuário clica no link de confirmação do e-mail, ele é redirecionado para `/auth/callback`, que valida o código de confirmação e estabelece a sessão automaticamente, sem necessidade de re-autenticação.

## Configuração no Painel Supabase

### 1. URL Configuration

No painel do Supabase, acesse **Authentication → URL Configuration** e configure:

#### Site URL
Define a origem da aplicação web:
- **Produção**: `https://seu-dominio.com`
- **Desenvolvimento**: `http://localhost:3000`

#### Redirect URLs
Adicione a URL de callback onde o usuário será redirecionado após clicar no link de confirmação:
- `/auth/callback` — exemplo completo: `https://seu-dominio.com/auth/callback`

**Importante**: Inclua tanto a versão com protocolo quanto sem, se necessário. Exemplo para localhost:
```
http://localhost:3000/auth/callback
```

### 2. Email Templates (Confirm signup)

O template padrão **"Confirm signup"** usa a variável `{{ .ConfirmationURL }}`, que automaticamente:
1. Gera um código de confirmação único
2. Constrói a URL com `redirect_to=/auth/callback?code=<CODE>`
3. Envia o link no e-mail

O visual precisa ser o mesmo card iNutri (faixa teal, logo, botão pílula) usado no recibo de pagamento. Cole o HTML correspondente em **Authentication → Email Templates**:

| Template no painel | Arquivo |
|---|---|
| Confirm signup | `docs/emails/confirm-signup.html` |
| Reset password | `docs/emails/reset-password.html` |
| Invite user | `docs/emails/invite-user.html` |

A fonte desses arquivos é `apps/api/src/support/transactional-email.ts`. O `{{ .ConfirmationURL }}` já aponta para o `redirect_to` (`/auth/callback`).

**Não use o template padrão em inglês** (`Confirm your signup`) — ele quebra o padrão visual dos outros e-mails.

## Fluxo de Auto-Login

```
1. Usuário clica no link no e-mail
   └─> URL: https://seu-dominio.com/auth/callback?code=<CONFIRMATION_CODE>&type=signup

2. Route handler `/auth/callback` é acionado
   └─> Chama `exchangeCodeForSession(code)`
   └─> Valida o código com Supabase
   └─> Cria a sessão da aplicação (cookies)

3. Usuário é redirecionado para `/` (home)
   └─> Gate de autorização leva ao onboarding (se necessário)
   └─> Usuário vê dashboard
```

## Checklist de Deploy

- [ ] `Site URL` = origem da aplicação (https://seu-dominio.com)
- [ ] `Redirect URLs` inclui `/auth/callback` no mesmo domínio
- [ ] Variável de ambiente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` estão configuradas
- [ ] Route handler `/auth/callback` existe e chama `exchangeCodeForSession`
- [ ] Página de confirmação (`/verify-email`) deixa claro que o clique no e-mail ativa a conta automaticamente

## Referências

- [Supabase Auth - Email Verification](https://supabase.com/docs/guides/auth/email-based/email-verification)
- [Supabase - URL Configuration](https://supabase.com/docs/guides/auth/redirect-urls)
