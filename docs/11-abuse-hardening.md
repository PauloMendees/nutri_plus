# Step 11 - Anti-abuso (rate limit, teto diário de IA, gate de cadastro)

Spec: `docs/superpowers/specs/2026-09-14-abuse-hardening-design.md`. Glossário em `CONTEXT.md`.

## Rate limit (API)

- `@nestjs/throttler`, guard global `ApiThrottlerGuard` registrado antes da autenticação. Registra dois throttlers: `global` (um balde por cliente em toda a API) e `route` (por handler, sobrescrito por `@Throttle`); `/health` pula os dois.
- Chave: `user:<sub>` em rota autenticada (sub lido do JWT sem verificar; forjar leva 401), `ip:<req.ip>` em rota pública.
- Números em `apps/api/src/common/rate-limit/rate-limit.policy.ts`.
- Resposta: 429 `{ code: 'RATE_LIMITED' }` + `Retry-After`.
- Armazenamento do throttler é em memória, uma instância no Render: os contadores zeram a cada deploy.
- Limitação conhecida (aceita pela spec): numa rota autenticada, um Bearer forjado com `sub` rotativo ganha um balde próprio a cada valor de `sub` — o limite por identidade só é caro pelo custo de verificar o JWT (sem consulta ao banco), não pela contagem em si.

## Teto diário de IA (API)

- `AiUsageCapService` consultado pelo `OpenAIProvider` antes de qualquer chamada (texto, visão, transcrição).
- Conta `AIInteraction` do dia em São Paulo, sucesso e falha. Nutricionista: todos os tipos, exceto o Fora de casa, que tem teto próprio por paciente. Números em `apps/api/src/ai/ai-usage-cap.policy.ts`.
- Resposta: 429 `{ code: 'AI_DAILY_CAP_EXCEEDED', scope }`. Em job de fundo, vira `FAILED` com a mensagem.
- Cotas mensais por plano continuam em `EntitlementsService`.

## Gate de cadastro (web)

- Widget Turnstile no formulário (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`), verificado em `POST /api/signup-gate` (`TURNSTILE_SECRET_KEY`).
- Sem site key: widget e gate desligados (dev/testes). Sem secret em produção: 503, falha fechado.
- Cloudflare fora do ar (fetch falha, status não-OK ou corpo que não parseia): 502 `{ code: 'CAPTCHA_UNAVAILABLE' }`. Só um `success` explicitamente falso com resposta OK vira 403 `{ code: 'CAPTCHA_FAILED' }`. Nunca 204 num desses casos.
- Captcha nativo do Supabase não é usado: valeria para o projeto todo e quebraria o login do app.

## Checklist de painel (uma vez)

1. Cloudflare → Turnstile → criar widget (modo Managed) com os domínios do web; copiar site key e secret key.
2. Vercel → projeto web → Environment Variables: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` (Production e Preview); redeploy.
3. Vercel → Firewall → ligar o managed ruleset de Bot Protection.
4. Supabase → Authentication → Attack protection: revisar limites de envio de e-mail e de tentativas de senha; confirmar "Confirm email" ligado.
5. OpenAI → Billing: limite mensal e alerta; a chave do iNutri só no Render do iNutri.
6. Render: nada a configurar (o rate limit não usa variável).
7. Logo após o primeiro deploy em produção: de uma máquina, mandar 6 `POST /v1/signals` com um valor diferente de `X-Forwarded-For` em cada (corpo válido `{ "name": "CompleteRegistration", "email": "teste@example.com" }`) e confirmar que a 6ª responde 429. Se não responder, o Render não está sobrescrevendo o header e o tracker precisa trocar para `CF-Connecting-IP`, com `req.ip` como fallback.
