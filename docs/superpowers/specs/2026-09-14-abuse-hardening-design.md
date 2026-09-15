# Endurecimento anti-abuso (login, cadastro e IA) — Design Spec

**Date:** 2026-09-14
**Status:** Approved for planning (forense + entrevista 2026-09-14)
**Related:** `docs/05-ai-architecture.md` (gateway único da OpenAI), `docs/09-observability.md` (uso de IA auditado em `AIInteraction`), `docs/superpowers/specs/2026-08-28-ai-background-jobs-design.md` (cota mensal e jobs).

## Problem Statement

O iNutri paga a OpenAI por chamada e cria conta de nutricionista com trial a partir de um formulário público. Hoje nada limita quantas requisições um mesmo cliente faz à API, nenhum caminho de IA tem teto diário, e o cadastro web não distingue pessoa de robô.

Duas evidências de 2026-09-14 mostram o tamanho da exposição:

- Entre 10 e 14 de setembro, 12 dos 19 cadastros de nutricionista vieram de domínios corporativos, `.gov` e `.edu` dos EUA, com zero atividade. Cada um criou perfil e assinatura em trial e disparou `CompleteRegistration` para o Meta, ensinando a campanha de aquisição a buscar mais robôs.
- Um pico de gasto de US$90 na OpenAI em 11 de setembro acabou explicado por uma chave usada em outro projeto, mas a investigação revelou que, se fosse abuso, a API não teria nenhuma barreira: sem rate limit, com dois endpoints públicos (`POST /v1/auth/login` e `POST /v1/signals`) e com dois caminhos de IA sem cota (mapeamento de colunas da importação e o "Fora de casa" do app gratuito da paciente).

## Solution

Quatro barreiras, cada uma no ponto mais alto possível:

1. **Rate limit na API**, global e por rota, identificando o cliente pelo `sub` do JWT quando autenticado e pelo IP quando não. Rotas públicas e rotas que disparam IA ganham limites mais apertados.
2. **Teto diário de IA** aplicado no gateway único da OpenAI, cobrindo todo tipo de chamada presente e futura: 60 chamadas por dia por nutricionista (todos os tipos, exceto o Fora de casa, que tem teto próprio por paciente) e 10 por dia por paciente no "Fora de casa". É rede de segurança, abaixo das cotas mensais de plano, que continuam valendo.
3. **Gate de cadastro com Cloudflare Turnstile** no formulário web: o `signUp` no Supabase só acontece depois que o token do widget é verificado no servidor. Sem widget resolvido, sem conta e sem `CompleteRegistration`.
4. **Remoção do proxy público de login** da API. Web e app usam o SDK do Supabase diretamente; o endpoint não tem chamador e concentrava tentativas de senha no IP único do Render.

Fora do código, um checklist de painel: criar o widget Turnstile, configurar as duas variáveis no Vercel, revisar a proteção contra ataques do Supabase Auth e ligar a proteção contra bots do Vercel na landing e no cadastro.

## User Stories

1. Como dono do iNutri, quero que a API rejeite rajadas de requisições de um mesmo cliente, para que um script não consiga esgotar banco, OpenAI ou e-mails.
2. Como dono do iNutri, quero limites mais apertados nas rotas públicas, para que quem não tem conta consiga fazer pouquíssimo.
3. Como dono do iNutri, quero que uma conta autenticada seja limitada pela própria identidade e não pelo IP, para que uma clínica com vários profissionais no mesmo Wi-Fi não seja bloqueada por engano.
4. Como dono do iNutri, quero que o limite por IP não seja burlável falsificando cabeçalhos, para que o rate limit tenha valor real.
5. Como dono do iNutri, quero que nenhum caminho de IA, atual ou futuro, escape de um teto diário, para que um loop ou uma conta abusiva custe no máximo um valor previsível por dia.
6. Como dono do iNutri, quero que o teto diário conte também as chamadas que falharam, para que repetir uma chamada quebrada não seja gratuito.
7. Como nutricionista, quero continuar usando a IA dentro da cota mensal do meu plano sem esbarrar no teto diário em uso normal, para que a proteção seja invisível para mim.
8. Como nutricionista, quero uma mensagem clara quando bater no teto diário ("Limite diário de IA atingido. Tente amanhã."), para que eu saiba que não é erro e quando posso voltar.
9. Como nutricionista, quero que uma geração em segundo plano que bateu no teto apareça como falha com essa mesma mensagem, para que o painel de jobs explique o que aconteceu.
10. Como paciente, quero que o "Fora de casa" continue funcionando até 10 vezes por dia, para que o uso legítimo caiba com folga.
11. Como paciente, quero uma mensagem amigável ao passar do limite diário, para não achar que o app quebrou.
12. Como visitante que quer criar conta, quero que o cadastro peça no máximo um desafio invisível, para que a proteção não me atrapalhe.
13. Como visitante, quero uma mensagem clara se o desafio falhar ("Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo."), para saber o que fazer.
14. Como dono do iNutri, quero que o `CompleteRegistration` só dispare depois do gate, para que a campanha do Meta aprenda com cadastros de pessoas.
15. Como dono do iNutri, quero que o gate falhe fechado em produção se a chave secreta faltar, para que uma configuração incompleta não deixe o cadastro desprotegido em silêncio.
16. Como desenvolvedor, quero que sem chave do Turnstile configurada o cadastro funcione como antes, para que dev e testes não precisem do serviço.
17. Como dono do iNutri, quero que o endpoint público de login deixe de existir, para reduzir a superfície pública da API.
18. Como usuário do web, quero um aviso amigável quando a API responder "muitas solicitações", para saber que devo aguardar um minuto.
19. Como dono do iNutri, quero que a saúde do serviço (`/health`) fique fora do rate limit, para que o monitoramento do Render nunca seja bloqueado.
20. Como dono do iNutri, quero que os limites e tetos sejam constantes nomeadas num só lugar, para ajustá-los com um commit.
21. Como dono do iNutri, quero um checklist dos passos de painel (Cloudflare, Vercel, Supabase, OpenAI), para concluir a proteção sem reler o código.

## Implementation Decisions

### Rate limit (API)

- Biblioteca: `@nestjs/throttler` 6.x, armazenamento em memória (uma instância no Render; se houver mais de uma, cada uma limita sozinha, o que é aceitável para o objetivo).
- Um único guard global, registrado **antes** dos guards de autenticação, para que a rejeição aconteça antes de qualquer consulta ao banco.
- Identificação do cliente (tracker): se a requisição traz `Authorization: Bearer` com um JWT cujo payload tem `sub`, a chave é `user:<sub>` (decodificação sem verificação: um `sub` forjado só produz 401 logo depois, sem ganho). Caso contrário, `ip:<req.ip>`. O `req.ip` vem do `trust proxy` já ligado; a equipe do Render afirma que o primeiro IP do `X-Forwarded-For` é o do cliente real.
- Limite global padrão: 120 requisições por minuto por chave.
- Limites por rota (por minuto, mesma chave): relay público do Meta 5; sync-user 20; gerar e ajustar plano 10; retry de job 10; silhueta 5; upload e transcrição de áudio 5; preview da importação 10; "Fora de casa" 5. `/health` fica fora do throttler. Endpoints internos (lembretes, webhook do Asaas) ficam no padrão global.
- Resposta ao estourar: HTTP 429 com corpo `{ statusCode: 429, code: 'RATE_LIMITED', message: 'Muitas solicitações. Aguarde um minuto e tente de novo.' }` e cabeçalho `Retry-After`. O filtro global de exceções já repassa `code` como campo extra.
- Os números vivem em um módulo de política de limites, nomeados, importados pelos controllers.

### Teto diário de IA (API)

- Novo serviço de teto de uso no módulo de IA, consultado pelo gateway da OpenAI antes de qualquer chamada (texto, visão e transcrição). O gateway continua sem conhecer números: ele garante que a checagem acontece; a política mora no serviço.
- Contagem: linhas de `AIInteraction` do dia corrente em America/Sao_Paulo, sucesso ou falha. Nutricionista: todos os tipos, exceto o Fora de casa, que tem teto próprio por paciente, 60 por dia. Paciente: tipo `OUTSIDE_HOME_SUGGESTION`, 10 por dia. O início do dia reaproveita a mesma lógica de fuso do início do mês da política de planos.
- Chamada sem `nutritionistId` e sem `patientId` não é limitada (não existe hoje; se surgir, o serviço avisa em log).
- Estouro: exceção HTTP 429 com corpo `{ statusCode: 429, code: 'AI_DAILY_CAP_EXCEEDED', scope: 'nutritionist' | 'patient', message: 'Limite diário de IA atingido. Tente amanhã.' }`. Nada é gravado em `AIInteraction` nem enviado à OpenAI.
- Em jobs em segundo plano, a exceção vira `FAILED` com essa mensagem no campo de erro, pelo caminho que já existe no runner.
- As cotas mensais por plano não mudam. O teto diário é uma segunda barreira, mais baixa por dia e mais alta por mês.

### Gate de cadastro (web)

- Widget Cloudflare Turnstile no formulário de cadastro, via `@marsidev/react-turnstile`, modo gerenciado (invisível na maioria dos casos). O botão "Criar conta" fica desabilitado até o widget produzir um token.
- Verificação no servidor por um route handler do Next.js (`POST /api/signup-gate`), que chama o `siteverify` da Cloudflare com a chave secreta e o IP do cliente. Respostas: 204 quando válido; 403 `{ code: 'CAPTCHA_FAILED' }` quando a Cloudflare responde OK com `success` diferente de `true`; 502 `{ code: 'CAPTCHA_UNAVAILABLE' }` quando a chamada à Cloudflare falha (fetch rejeita, status não-OK ou corpo que não parseia); 400 sem token; 503 `{ code: 'CAPTCHA_NOT_CONFIGURED' }` quando a chave secreta não está definida (falha fechado).
- Fluxo do formulário: validar campos, chamar o gate com o token, e só com 204 chamar o `signUp` do Supabase e o `trackCompleteRegistration`. Em 403 mostra a mensagem de robô e reinicia o widget. Em 503 mostra a mensagem genérica de erro.
- Variáveis: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (browser) e `TURNSTILE_SECRET_KEY` (servidor). Sem a pública, o formulário não renderiza o widget e não chama o gate: comportamento atual, para dev e testes.
- O `signUp` continua no cliente com o client de cadastro de fluxo implícito; a decisão registrada nele não muda.
- Login não recebe desafio: o Supabase já limita tentativas de senha e o abuso observado é no cadastro. Se um dia for necessário, o mesmo gate serve.
- Captcha nativo do Supabase Auth foi descartado: ele vale para o projeto inteiro e quebraria o login do app da paciente, que não tem widget.

### Remoção do proxy de login (API)

- `POST /v1/auth/login`, seu DTO e o método de serviço saem. O Swagger reflete a remoção. Nenhum cliente o usa; nenhum teste o cobre.

### Experiência de erro (web e app)

- Web: um mapeador de erro de limite, ao lado do de cobrança, reconhece 429 e devolve a mensagem certa por `code` (`RATE_LIMITED` ou `AI_DAILY_CAP_EXCEEDED`). O handler global de erros do React Query mostra a mensagem em toast.
- App da paciente: a tela "Fora de casa" mostra a mensagem do 429 no lugar do erro genérico.

### Passos de painel (não são código)

- Cloudflare: criar widget Turnstile para os domínios do web; copiar site key e secret key para o Vercel.
- Supabase Auth: revisar Attack protection (limites de e-mail e de senha) e confirmar que "Confirm email" está ligado.
- Vercel: ligar o managed ruleset de Bot Protection para o projeto web.
- OpenAI: limite mensal e alerta de gasto, e chave do iNutri usada só pelo iNutri.
- Contas-bot já criadas: exclusão é decisão do Paulo, fora desta spec.

## Testing Decisions

Um bom teste aqui exercita a barreira pelo lado de fora, no seam mais alto que existe, e afirma o sintoma que o usuário veria (o 429, o corpo com `code`, o `signUp` não chamado), nunca o mecanismo interno.

- **API, seam HTTP (e2e com supertest e banco de teste, prior art `test/auth.e2e-spec.ts`)**: o relay público do Meta aceita 5 e rejeita a sexta com 429 e `code: 'RATE_LIMITED'`; `/health` responde 200 além do limite; `POST /v1/auth/login` responde 404; duas identidades diferentes não compartilham contador. Cada suíte sobe sua própria instância da aplicação, porque o armazenamento do throttler é em memória e não é limpo entre testes.
- **API, seam do gateway da OpenAI (prior art `openai.provider.spec.ts`)**: com o teto estourado, o SDK não é chamado, nada é gravado e a exceção tem `code: 'AI_DAILY_CAP_EXCEEDED'`; com folga, o fluxo atual segue igual. Vale para texto e transcrição.
- **API, seam do serviço de teto (prior art `entitlements.service.spec.ts`, Prisma mockado)**: contagem no dia de São Paulo, fronteira exata em 60 e 10, escopo certo por nutricionista e por paciente, falhas contam.
- **API, seam do runner de jobs (prior art `ai-jobs.service.spec.ts`)**: exceção de teto vira `FAILED` com a mensagem em português.
- **Web, seam do formulário (prior art `signup-form.test.tsx`)**: com site key, o botão fica desabilitado até o token; o gate recebe o token; 403 mostra a mensagem de robô e não chama `signUp`; 204 chama `signUp` e o `trackCompleteRegistration`. Sem site key, os testes atuais seguem verdes sem alteração.
- **Web, seam do route handler (prior art `auth/callback/route.test.ts`)**: `fetch` da Cloudflare mockado; 204, 403, 400 e 503 conforme o caso; a chave secreta nunca aparece na resposta.
- **Web, seam do mapeador de erro (prior art `billing-errors.test.ts`)**: 429 com cada `code` vira a mensagem certa; outros status são ignorados.
- **App, seam da tela (prior art `fora-de-casa.test.tsx`)**: 429 mostra a mensagem amigável.

## Out of Scope

- Cota de IA reduzida para contas em trial. O risco por conta fica limitado pelo teto diário e pelo gate; se o trial começar a ser abusado, esse é o gatilho para revisitar.
- Captcha no login, no reset de senha e no app da paciente.
- Turnstile ou qualquer desafio no app mobile.
- Mover o `signUp` para dentro da API.
- Armazenamento distribuído para o throttler (Redis).
- Bloqueio por lista de domínios de e-mail ou heurísticas de nome.
- Exclusão das contas-bot já existentes e limpeza retroativa dos eventos do Meta.
- WAF ou regras de firewall do Vercel além de ligar a proteção gerenciada contra bots.

## Further Notes

- A investigação de 2026-09-14 está registrada na memória do projeto: `AIInteraction` não tinha nenhuma linha em 11 de setembro; os US$90 foram de uma chave usada em outro projeto.
- O gateway único da OpenAI é o que torna o teto diário barato: um ponto de checagem cobre cinco tipos de chamada hoje e qualquer tipo novo amanhã. Isso é a razão de a checagem morar ali e não em cada serviço.
- O tracker do throttler prefere o `sub` do JWT ao IP para que usuários atrás do mesmo NAT (clínicas, faculdades, o Vercel em route handlers) não dividam contador. Rotas públicas continuam por IP, e o único cabeçalho de IP considerado é o que o Render preenche.
- Glossário (`CONTEXT.md`) ganha dois termos: **Teto diário de IA** e **Gate de cadastro**.
