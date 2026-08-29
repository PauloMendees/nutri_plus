# Plano de testes E2E — iNutri Web (Claude no Chrome)

Playbook para o Claude no Chrome varrer a aplicação web do iNutri de ponta a ponta, **criando contas novas** e exercitando trial + pagamento, e devolver um relatório de problemas.

**Ambiente padrão:** produção  
**URL de marketing e dashboard:** `https://inutri.life`  
**Local (opcional):** `http://localhost:3001` (API em `http://localhost:8080`)

O host `app.inutri.life` **não existe**. Landing e app rodam no mesmo domínio.

O agente **não** usa contas pré-existentes. Ele cria **duas nutricionistas** nesta sessão:

| Conta | Jornada de billing | Depois testa o produto |
|---|---|---|
| **C1** | Cadastro → confirma e-mail → **teste grátis 7 dias** (entitlements de Pro) → assina **Essencial mensal** → **upgrade Pro mensal** | Paciente, planos, agenda, gates Pro vs Essencial |
| **C2** | Cadastro → confirma e-mail → **pula o trial** → paga **Pro mensal** na hora | Mesmo produto, já como Pro pago |

Cobrança esperada (catálogo atual): C1 ≈ R$ 39 (Essencial) + diferença pró-rata do upgrade para Pro; C2 = R$ 79. Confira os valores na tela antes de pagar.

---

## 0. Como usar

1. Deixe **aberta uma aba do provedor de e-mail de teste** (Gmail com plus-addressing, Outlook, Mailinator, etc.) — o agente precisa clicar no link “Confirmar e-mail”.
2. Abra o Chrome com a extensão Claude em `https://inutri.life`.
3. Cole o **Prompt mestre** da seção 1, já preenchido (e-mail base, cartão, CPF, inbox).
4. Anexe este playbook (ou cole o arquivo).
5. O agente executa na ordem da seção 7. Não para no primeiro bug.
6. No fim, relatório no formato da seção 13.

Retomar sessão: *“Retome `docs/qa/e2e-claude-chrome.md` na próxima suíte não executada. Não recomece do zero. As contas já criadas estão no log.”*

---

## 1. Prompt mestre (cole no Claude do Chrome)

```
Você é um QA sênior testando a aplicação web iNutri no Chrome.
Execute o plano de testes E2E abaixo de ponta a ponta. Não escreva código. Não “corrija” a aplicação. Só navegue, clique, preencha, observe e registre.

OBJETIVO
Criar DUAS contas novas de nutricionista, testar cadastro + confirmação de e-mail + assinatura/pagamento, e varrer o produto em cada fase de plano. Encontrar TODOS os problemas visíveis.

JORNADA OBRIGATÓRIA
- Conta C1: signup → confirmar e-mail → iniciar teste grátis (7 dias, sem cartão) → testar o app (trial = entitlements de Pro) → assinar Essencial MENSAL de verdade → testar gates de Essencial (Silhueta/transcrição/funcionários bloqueados) → upgrade para Pro MENSAL de verdade → testar de novo como Pro.
- Conta C2: signup → confirmar e-mail → NÃO clicar em teste grátis → escolher Pro MENSAL e pagar na hora → testar o app como Pro pago.

CONFIG (preencha antes de começar)
- BASE_URL: https://inutri.life
- MARKETING_URL: https://inutri.life
- VIEWPORTS: 1440×900 e 390×844
- EMAIL_BASE: ___                (ex.: meu.qa@gmail.com — o agente gera plus-address se o provedor aceitar: meu.qa+c1-YYYYMMDDHHMM@gmail.com)
- EMAIL_PLUS_ADDRESSING: sim|não
- INBOX: aba já aberta em ___    (URL do Gmail/Outlook/Mailinator. O agente DEVE ir até essa aba, achar o e-mail “Confirme seu e-mail” / iNutri e clicar em Confirmar.)
- SENHA_NOVAS_CONTAS: QaInutri!2026a
- PAGAMENTO: CREDIT_CARD
- CARTÃO_NÚMERO: ___
- CARTÃO_NOME: ___
- CARTÃO_VALIDADE: MM/AAAA
- CARTÃO_CVV: ___
- CPF: ___                       (11 dígitos, o Asaas exige)
- CEP: ___
- ENDERECO_NUMERO: ___
- TELEFONE: ___                  (com DDD)
- PODE_PAGAR: sim                (vai gerar cobrança real: C1 Essencial 39 + upgrade pró-rata; C2 Pro 79)
- PODE_GERAR_PLANO_IA: sim (1 por conta)
- NÃO cancele assinatura no fim. NÃO apague as contas.

REGRAS
1. Execute na ordem da seção 7. Não pule suíte sem motivo no relatório.
2. Não pare no primeiro bug. Anote e continue.
3. Bug: URL, viewport, conta (C1/C2), fase (trial/essencial/pro), passos, esperado vs obtido, severidade S1–S4, screenshot.
4. Em toda tela nova, checklist global (seção 6).
5. Feedback “O que você está achando do iNutri?” → dispense. Anote se o overlay bloquear.
6. Prefixo de dados: “QA Chrome”. Pacientes com e-mail @example.com.
7. Confirmação de e-mail: após /verify-email, vá à INBOX, espere até 120s, atualize, abra o e-mail do iNutri, clique “Confirmar e-mail”. O destino correto é /assinatura (já logado).
8. Pagamento: use CREDIT_CARD do CONFIG. Não invente cartão. Se o cartão recusar, registre S1 e pare a jornada de billing daquela conta (o produto no trial ainda pode ser testado na C1).
9. PIX só se PAGAMENTO=PIX: gere o QR e espere até 5 min o status virar Ativa (a página já faz poll de 5s). Avise na tela se precisar de pagamento humano.
10. Trial dá entitlements de Pro. Essencial DEVE bloquear Silhueta, transcrição e novo funcionário. Pro DEVE liberar.
11. Compare preços landing vs /assinatura vs valor cobrado.
12. Relatório final = seção 13. Inclua e-mails das contas criadas e o que foi cobrado.

Comece pela S00 em MARKETING_URL, ainda deslogado.
```

Cole em seguida este arquivo, ou as seções 2–13.

---

## 2. Mapa da aplicação

### Rotas públicas (sem sessão)

| Rota | Tela |
|---|---|
| `/` | Landing. Logado → `/patients` |
| `/login` | Login. Logado → `/patients` |
| `/signup` | Cadastro de nutricionista |
| `/verify-email` | “Confirme seu e-mail” |
| `/forgot-password` | Recuperação |
| `/reset-password` | Nova senha (após link) |
| `/accept-invite` | Convite |
| `/download-app` | Paciente: App Store / Play |
| `/privacy` | Política de privacidade |
| `/suporte` | Suporte público |
| `/robots.txt` / `/sitemap.xml` | Sem redirect para `/login` |

### Rotas autenticadas

| Rota | Quem | O que faz |
|---|---|---|
| `/patients` | Nutri + funcionário | Lista. Só nutri cria |
| `/patients/new` | Só nutri | Nome* + e-mail* |
| `/patients/:id` | Nutri edita / func. lê | Dados, Anamnese, Bioimpedância, Metas (nutri), Planos, Recordatório, Silhueta (Pro) |
| `/patients/:id/planos/novo` | Nutri | Editor manual |
| `/patients/:id/planos/:planId` | Nutri / func. | Editor + IA + PDF |
| `/patients/:id/recordatorios/...` | Nutri / func. | Recordatório 24h |
| `/alimentos` | Só nutri | TACO (mín. 2 letras) |
| `/agenda` e `/agenda/categorias` | Nutri + func. | Calendário |
| `/employees` | Só nutri | Convites (criar = Pro) |
| `/contabilidade` e `/categorias` | Nutri + func. | Extrato |
| `/configuracoes` | Só nutri | Plano, aparência, app, assinatura |
| `/assinatura` | Nutri | Trial / checkout / troca |

Confirmação de signup (`/auth/callback` com `code`) sincroniza o usuário como `NUTRITIONIST` e manda para **`/assinatura`**.

### Gates

- **OnboardingGate:** `onboardedAt === null` → qualquer rota do app vai para `/assinatura`.
- **Trial:** botão “Começar teste grátis (7 dias)” só se `onboardedAt === null`. Trial **não pede cartão**. Enquanto `TRIALING` e `trialEndsAt` no futuro, entitlements = **Pro**.
- **BillingGate:** trial → faixa “Seu teste termina em N dia(s)”. Somente-leitura → faixa vermelha.
- **ProGate (Essencial):** Silhueta, transcrição, “Novo funcionário” viram cadeado. Clique abre “Recurso do plano Pro”.
- **Checkout:** se a conta **não** está `ACTIVE`, `/assinatura` mostra picker + (se ainda não onboardou) o trial. Cartão redireciona na hora; Pix mostra QR e a página faz poll a cada 5s.
- **Upgrade:** só com assinatura `ACTIVE`. Cartão cobra a diferença e aplica na hora (“Upgrade concluído!”). Pix mostra QR da diferença.

### Sidebar

Pacientes, Alimentos (nutri), Agenda + Categorias, Funcionários (nutri), Contabilidade + Categorias, Configurações (nutri). Rodapé: Suporte, nome + “Nutricionista”, Sair. Mobile: logo + hambúrguer.

---

## 3. Dados de teste

`TS` = `YYYYMMDDHHMM` do início da sessão. Senha de ambas as contas = `SENHA_NOVAS_CONTAS`.

| Entidade | C1 | C2 |
|---|---|---|
| Nome do nutri | `QA Chrome C1 TS` | `QA Chrome C2 TS` |
| E-mail | ver protocolo de e-mail | ver protocolo de e-mail |
| Paciente | `QA C1 Paciente TS` | `QA C2 Paciente TS` |
| E-mail do paciente | `{EMAIL_BASE} local+pac1-TS@…` (e-mail **entregável**, nunca `@example.com`) | idem `pac2` |

Comum às duas contas:

| Campo | Valor |
|---|---|
| Nascimento | `1990-05-15` |
| Sexo | Feminino |
| Altura | `165` |
| Peso alvo | `60` |
| Objetivo | Perda de peso |
| Atividade | Moderado |
| Restrições | Sem lactose |
| Alergias | Amendoim |
| Consulta | `QA consulta TS` hoje 09:00–10:00 |
| Categoria agenda | `QA retorno` |
| Transação | Receita `150,00` — `QA consulta teste` |
| Categoria financeira | `QA honorários` |
| TACO | `arroz`, `frango` |
| Plano | `QA plano TS` |
| IA | `apenas 4 refeições; sem amendoim` |

---

## 4. Protocolos: e-mail e pagamento

O agente segue estes protocolos **sempre** que a suíte pedir “confirmar e-mail” ou “pagar”.

### 4.1 Gerar e-mail da conta

Se `EMAIL_PLUS_ADDRESSING=sim` e `EMAIL_BASE=local@dominio`:

- C1: `local+c1-TS@dominio`
- C2: `local+c2-TS@dominio`

Se `não`: peça dois endereços únicos na INBOX (Mailinator e similares: um endereço por conta) e anote no log. **Nunca reutilize** o e-mail da C1 na C2.

Anote no relatório: e-mail, senha, horário do signup.

### 4.2 Confirmar e-mail (obrigatório, até 120s)

1. Signup com nome, e-mail, senha (≥ 8) e confirmar senha.
2. Destino: `/verify-email?email=...` com “Confirme seu e-mail” e o endereço visível.
3. Vá à aba **INBOX**. Atualize. Procure remetente iNutri / assunto de confirmação. Botão **Confirmar e-mail** (ou o link cru no corpo).
4. O link abre `/auth/callback?code=...` e deve cair em **`/assinatura`**, já autenticado. Sem loop, sem “Link de confirmação inválido.”
5. Se o e-mail não chegar em 120s: atualize de novo, olhe spam. Ainda nada = **S1** daquela conta. Não invente confirmação.

Não use a mesma mensagem da C1 para a C2.

### 4.3 Pagar com cartão (padrão)

Na tela de checkout (plano já escolhido, método Cartão):

1. Preencha com o CONFIG: número, nome, validade MM/AAAA, CVV, CPF, CEP, número, telefone.
2. Submit vazio (na primeira vez que abrir o form nesta sessão) deve validar campo a campo — anote se faltar mensagem.
3. Envie de verdade. Loading visível.
4. Sucesso: redirect para `/` (ou `/patients`). Configurações → Assinatura: status **Ativa**, plano certo, método Cartão •••• últimos 4.
5. Recusa: “Cartão recusado…” ou mensagem 422. **S1**. Não fique tentando o mesmo cartão mais de 2 vezes.

Valores a conferir no momento do clique (não assumir):

- Essencial mensal no catálogo de cobrança: **R$ 39**
- Pro mensal: **R$ 79**
- Landing pode mostrar outros números — divergência = achado.

### 4.4 Pagar com Pix (só se `PAGAMENTO=PIX`)

1. CPF/CNPJ 11 ou 14 dígitos. `123` → “Informe um CPF (11) ou CNPJ (14) válido.”
2. Gerar código → QR + payload copiável. Poll de 5s não trava a UI.
3. Espere até **5 minutos** o status virar Ativa (a página já recarrega a assinatura sozinha). Se um humano precisar pagar o QR, escreva isso na tela e espere.
4. Timeout 5 min = S1 da jornada de pagamento.

### 4.5 Upgrade Essencial → Pro mensal (C1)

Só depois da C1 estar **Ativa / Essencial**.

1. `/assinatura` (ou Configurações → Trocar plano). Título “Troque de plano”.
2. Toggle Mensal. Card Pro **não** diz “Seu plano atual”. Preview da diferença **dentro** do card (`amountNow` > 0). Não mostre R$ 0 enganoso.
3. Escolher Pro mensal.
   - Cartão: “Upgrade concluído! Você pagou R$ X.” X ≈ diferença pró-rata (quase R$ 50 se o ciclo Essencial acabou de começar).
   - Pix: “Pague a diferença…” + QR; espere o poll até o plano virar Pro.
4. Ir para o painel. Silhueta / transcrição / novo funcionário **liberados**. Aba Assinatura: plano **Pro**, status Ativa.

Não faça downgrade. Não clique em Cancelar assinatura.

---

## 5. Severidade

| Nível | Use quando |
|---|---|
| **S1 — Bloqueante** | Não cria conta, e-mail não confirma, pagamento não conclui, módulo inteiro cai, dados perdidos, LGPD quebrado |
| **S2 — Grave** | Fluxo principal falha (paciente, plano, IA, agenda, upgrade) com workaround |
| **S3 — Médio** | Gate Pro/Essencial errado, validação, empty state, copy, preço divergente, layout |
| **S4 — Baixo** | Typo, alinhamento, hover |

Todo achado: suíte, URL, viewport, conta, fase, passos, esperado, obtido, severidade.

---

## 6. Checklist global (toda tela nova)

1. Sai do skeleton. Sem spinner eterno.
2. Sem “Algo deu errado”, toast inesperado, overlay preso.
3. Console sem erro vermelho de React/hydration/404 de asset.
4. Network: sem 4xx/5xx inesperado (401 após login válido = S1).
5. Heading em português.
6. Sidebar: item ativo = URL.
7. Sem corte, sobreposição ou scroll horizontal no desktop.
8. Submit vazio valida no campo. Botão mostra loading.
9. Esc fecha dialog. Tab percorre controles.
10. Tema escuro, se ligado, continua legível.
11. Toasts em português, sem chave técnica.
12. Sem 404 interno.

---

## 7. Ordem de execução (obrigatória)

```
S00  Landing / SEO / preços          (anônimo)
S01  Validação de auth               (anônimo, SEM criar conta)
C1A  Signup C1 + e-mail + /assinatura
C1B  Iniciar teste grátis
C1C  Pacote PRODUTO na C1 em trial   (entitlements Pro) + PACOTE-GATES-PRO
C1D  Assinar Essencial mensal
C1E  PACOTE-GATES-ESSENCIAL + fumaça do paciente C1
C1F  Upgrade Pro mensal
C1G  PACOTE-GATES-PRO de novo + Assinatura
C1H  Logout C1
C2A  Signup C2 + e-mail + /assinatura
C2B  Pular trial, pagar Pro mensal
C2C  Pacote PRODUTO na C2 como Pro pago + PACOTE-GATES-PRO
S20  Regressão rápida C2 (desktop+mobile)
Relatório
```

**Pacote PRODUTO** = S02 (shell) + S03–S09 (um paciente da conta) + S11 + S12 + S14 + S16.  
**PACOTE-GATES-PRO** = S10 (Silhueta visível) + transcrição desbloqueada (S05.8) + S15 criar funcionário desbloqueado (abra o dialog; só convide se sobrar e-mail de teste).  
**PACOTE-GATES-ESSENCIAL** = S10.1 cadeado + S05.8 cadeado + S15.2 cadeado. Paciente da C1 continua acessível e editável.

IA: **1 geração por conta** (C1 no trial, C2 no Pro pago). Não gere de novo no upgrade.  
Suporte interno (S17.3): envie **no máximo 1** ticket na sessão inteira (C2).  
S18/S19 (papel funcionário/paciente no web): pule, a menos que um convite da S15 seja aceito nesta sessão.

Se o tempo apertar depois de C1G, ainda execute C2A–C2B (pagamento direto é o segundo objetivo). Não entregue o relatório só com a C1.

---

## 8. Suítes

### S00 — Fumaça pública e SEO `[DESKTOP + MOBILE]`

| # | Passo | Esperado |
|---|---|---|
| 0.1 | `MARKETING_URL/` anônimo, 1440px | Landing completa: hero, CTAs cadastro/login, `#precos`, FAQ. Sem tela em branco. |
| 0.2 | CTAs “Começar” / “Entrar” | `/signup` ou `/login`, não 404. |
| 0.3 | `#precos`, Mensal / Anual | Cards Essencial e Pro. CTA Essencial → `/signup?plan=essencial`. CTA Pro → `/signup?plan=pro`. |
| 0.4 | **Anote os preços da landing** | Devem bater com `/assinatura` e com o valor cobrado: Essencial **R$ 39**/mês (**R$ 390**/ano), Pro **R$ 79**/mês (**R$ 790**/ano). Pro: 200 ações de IA/mês (não “ilimitada”). Contabilidade existe nos dois planos. |
| 0.5 | FAQ 2–3 itens | Português, sem placeholder. |
| 0.6 | `/privacy` | “Política de Privacidade”, LGPD, `contato@inutri.life`. |
| 0.7 | `/suporte` | mailto `contato@inutri.life`. |
| 0.8 | `/robots.txt`, `/sitemap.xml` | **Não** vão para `/login`. Sitemap: `/`, `/signup`, `/login`, `/suporte`, `/privacy`. |
| 0.9 | 0.1–0.3 em 390px | CTA sticky não tapa conteúdo. Sem scroll horizontal. |

---

### S01 — Auth visitante `[DESKTOP]`

Não crie conta aqui.

| # | Passo | Esperado |
|---|---|---|
| 1.1 | `/patients` deslogado | `/login`. |
| 1.2 | `/login` | “Bem-vindo de volta”. E-mail, senha, links cadastro e esqueci senha. |
| 1.3 | Submit vazio | “Informe um e-mail válido.” / “Informe sua senha.” |
| 1.4 | `nao-email` | Erro de e-mail. |
| 1.5 | E-mail ok + senha errada | Mensagem amigável (não `AuthApiError`). |
| 1.6 | Toggle senha | Alterna `password` / texto. |
| 1.7 | `/signup` | Nome, e-mail, senha, confirmar. |
| 1.8 | Nome 1 letra; senha `< 8`; senhas diferentes | “Informe seu nome.” / “A senha deve ter ao menos 8 caracteres.” / “As senhas não coincidem.” |
| 1.9 | `/forgot-password` e-mail qualquer | Estado de e-mail enviado. |
| 1.10 | `/reset-password` sem token | Não grava senha solta; sem 500. |
| 1.11 | `/accept-invite` sem token | Erro compreensível, não crash. |

---

### C1A — Signup da Conta 1 + e-mail

| # | Passo | Esperado |
|---|---|---|
| C1A.1 | `/signup` com nome/e-mail/senha da C1 | `/verify-email` com o e-mail na tela. |
| C1A.2 | Protocolo 4.2 | Cai em `/assinatura` logado. Heading “Escolha seu plano”. |
| C1A.3 | Conteúdo | Cards Essencial e Pro, Mensal/Anual. Bloco “Experimente grátis por 7 dias, sem cartão” + botão “Começar teste grátis (7 dias)”. |
| C1A.4 | Abrir `/patients` agora | OnboardingGate devolve para `/assinatura` (ainda não onboardou). Sem loop infinito. |
| C1A.5 | Preços nos cards | Anote e compare com S00.4. |

---

### C1B — Iniciar teste grátis

| # | Passo | Esperado |
|---|---|---|
| C1B.1 | “Começar teste grátis (7 dias)” | Loading “Iniciando…”. Vai para `/` → `/patients`. **Sem loop de volta para `/assinatura`** (bug antigo de cache). |
| C1B.2 | Faixa | “Seu teste termina em **7** dia(s)” (ou 6 se cruzar meia-noite) + link Assinar → `/assinatura`. |
| C1B.3 | `/assinatura` de novo | **Não** mostra o botão de trial (já onboardou). Mostra o picker para assinar. Volte ao painel sem pagar ainda. |
| C1B.4 | Configurações → Assinatura | Status **Em teste**. Plano pode aparecer “—”. Próxima cobrança “—”. |

---

### C1C — Produto na C1 em trial (Pro)

Rode o **Pacote PRODUTO** (S02–S09, S11, S12, S14, S16) e o **PACOTE-GATES-PRO**.

Esperado específico do trial:

- Entitlements de **Pro**: Silhueta visível (não cadeado), transcrever disponível, “+ Novo funcionário” disponível.
- Faixa de trial visível no app.
- Chip de cota de IA presente. 1 geração de plano com IA nesta conta.
- Não pague nada nesta suíte.

---

### C1D — Assinar Essencial mensal

| # | Passo | Esperado |
|---|---|---|
| C1D.1 | `/assinatura` | Picker. Escolher **Essencial** + **Mensal**. |
| C1D.2 | Método Cartão (ou Pix se CONFIG) | Protocolo 4.3 / 4.4. |
| C1D.3 | Após sucesso | Dashboard. Faixa de trial **some**. Sem faixa somente-leitura. |
| C1D.4 | Configurações → Assinatura | Plano **Essencial (mensal)**. Status **Ativa**. Método preenchido. Histórico com 1 pagamento ~ R$ 39 (ou o valor efetivamente cobrado — anote). |
| C1D.5 | Recibo | Se chegar e-mail de recibo na INBOX, anote. Se não chegar, S3 (não bloqueia). |

---

### C1E — Gates de Essencial + fumaça

Rode **PACOTE-GATES-ESSENCIAL**. Depois abra o paciente C1: dados, plano salvo e agenda ainda existem.

| Feature | Esperado no Essencial |
|---|---|
| Aba Silhueta | Cadeado “Silhueta (Pro)” → modal “Recurso do plano Pro” → Ver planos = `/assinatura` |
| Transcrever | Cadeado “Transcrever (Pro)” → mesmo modal |
| + Novo funcionário | Cadeado “Funcionários (Pro)” |
| Pacientes, planos manuais, agenda, TACO, metas, caixa | Continuam editáveis |
| Contabilidade | Acessível no app (se a landing disse que é Pro, registre inconsistência) |

---

### C1F — Upgrade para Pro mensal

Protocolo 4.5. Se o upgrade ficar `PENDING` (antifraude), espere até 2 min e recarregue Assinatura. Ainda pending = anote S2 e continue a C2; volte no fim para ver se virou Pro.

---

### C1G — C1 como Pro pago

PACOTE-GATES-PRO de novo no **mesmo** paciente C1 (não precisa recadastrar). Silhueta/transcrição/funcionários liberados. Assinatura = Pro mensal Ativa. Não gere segundo plano de IA.

---

### C1H — Logout C1

Sidebar → Sair → `/login`. `/patients` redireciona para login. Voltar do browser continua deslogado.

---

### C2A — Signup da Conta 2 + e-mail

Igual C1A, com nome/e-mail da C2. Cai em `/assinatura` com trial ainda disponível.

---

### C2B — Pular trial, pagar Pro mensal

| # | Passo | Esperado |
|---|---|---|
| C2B.1 | **Não** clique em “Começar teste grátis”. | |
| C2B.2 | Escolher **Pro** + **Mensal** | Passo Pix/Cartão. |
| C2B.3 | Pagar (protocolo 4.3/4.4) | Redirect ao painel. **Sem** faixa de trial. Sem onboarding loop. |
| C2B.4 | Configurações → Assinatura | Plano **Pro (mensal)**, **Ativa**, pagamento ~ R$ 79. |
| C2B.5 | Abrir `/assinatura` | Título “Troque de plano”. Card Pro = “Seu plano atual”. Essencial mostra preview de **agendamento** (downgrade), não cobrança na hora. Não confirme downgrade. |

---

### C2C — Produto na C2 como Pro pago

Pacote PRODUTO + PACOTE-GATES-PRO na C2 (paciente próprio). 1 geração de IA. 1 ticket de suporte (S17.1–S17.3) se ainda não enviou.

---

### S02 — Shell autenticado `[DESKTOP + MOBILE]`

Usado dentro de C1C e C2C.

| # | Passo | Esperado |
|---|---|---|
| 2.1 | Home do app | `/patients`. Sem loop. |
| 2.2 | Sidebar | Logo, Pacientes, Alimentos, Agenda (+ Categorias), Funcionários, Contabilidade (+ Categorias), Configurações. Rodapé: Suporte, nome, Nutricionista, Sair. |
| 2.3 | Cada item do menu | URL e heading batem. |
| 2.4 | Widget agenda de hoje | Não tapa o conteúdo. Empty decente. |
| 2.5 | Feedback | Dispensar. Overlay some. |
| 2.6 | Mobile 390px | Hambúrguer, sheet fecha ao navegar. |
| 2.7 | `/login` logado | Redirect `/patients`. |
| 2.8 | `/` logado | Redirect `/patients` (não a landing). |

---

### S03 — Pacientes: lista e cadastro `[DESKTOP]`

| # | Passo | Esperado |
|---|---|---|
| 3.1 | `/patients` | Heading, contador, “+ Novo paciente”. |
| 3.2 | Empty (0) | “Nenhum paciente ainda” + CTA. |
| 3.3 | Com pacientes | Clique abre ficha. |
| 3.4 | Busca existente | Debounce ~300ms. Página 1. |
| 3.5 | `zzzzzzinexistente` | “Nenhum paciente encontrado.” |
| 3.6 | `/patients/new` | Nome * e E-mail *. Convite por e-mail. |
| 3.7 | Submit vazio | “Informe o nome do paciente.” / “Informe um e-mail válido.” |
| 3.8 | Criar paciente da conta (seção 3) | “Criando…”. `/patients/:id?created=1`. Banner. Consentimento pendente. |
| 3.9 | Nascimento futuro / altura 0 | Mensagens de validação. |
| 3.10 | Cancelar | Volta à lista sem criar. |

---

### S04 — Ficha: Dados `[DESKTOP]`

| # | Passo | Esperado |
|---|---|---|
| 4.1 | Header | Avatar, nome, e-mail, badge Paciente, Voltar, IMC, LGPD. |
| 4.2 | Abas | Dados, Anamnese, Bioimpedância, Metas, Planos, Recordatório. Silhueta conforme o plano da fase. |
| 4.3 | Editar objetivo/restrições e salvar | Persiste no reload. |
| 4.4 | Exportar evolução sem avaliações | Botão desabilitado. |
| 4.5 | UUID inexistente | “Paciente não encontrado.” |

Foto (PNG) é opcional; se testar, toast “Foto atualizada.” / “Foto removida.”

---

### S05 — Anamnese + áudio `[DESKTOP]`

| # | Passo | Esperado |
|---|---|---|
| 5.1 | Grupos | Clínico, Hábitos, Digestivo, Alimentar, Geral. |
| 5.2 | Queixa + sono `7` + água `2` | “Anamnese salva.” |
| 5.3 | Gravação | Consentimento obrigatório. ~3s → “Gravação salva.” Negar mic → erro amigável. Trocar de aba durante gravação libera o mic. |
| 5.4 | Transcrever | **Pro/trial:** gera texto. **Essencial:** cadeado + modal Pro. |

---

### S06 — Bioimpedância `[DESKTOP]`

| # | Passo | Esperado |
|---|---|---|
| 6.1 | Avaliação peso `68`, % gordura `28`, cintura `80`, quadril `98` | Salva. |
| 6.2 | Data futura / % 150 / peso 0 | Validação. |
| 6.3 | Segunda avaliação peso `67` | Gráfico troca de métrica. Exportar PDF. IMC atualiza. |

---

### S07 — Metas `[DESKTOP]`

Pré-preenchido com sexo, idade (nasc. 15/05/1990), altura 165, peso da avaliação. Mifflin/Harris calculam. Katch pede % gordura. Salvar entra no histórico. Sem NaN.

---

### S08 — Planos + IA `[DESKTOP]`

| # | Passo | Esperado |
|---|---|---|
| 8.1 | Empty + “Gerar com IA” + “Novo plano” | Chip de cota visível. |
| 8.2 | Plano manual + TACO `arroz` 100 g | Macros preenchidos. Salva. Disponibilizar toggle. PDF. |
| 8.3 | IA **1 vez por conta** | Dialog; instrução da seção 3. Campos faltando listados (não 500). Sucesso: badge IA, refeições preenchidas. |
| 8.4 | Cota esgotada | Modal “Cota de IA esgotada”. |

---

### S09 — Recordatório `[DESKTOP]`

Novo, data hoje, 1 alimento TACO, persiste ao reabrir.

---

### S10 — Silhueta `[DESKTOP]`

| Fase | Esperado |
|---|---|
| Essencial | Cadeado + modal Pro |
| Trial ou Pro | Aba com disclaimer (não é diagnóstico; fotos não ficam armazenadas). Sem fotos/altura → validação, não 500. Scan real só se houver fotos frente/lado — senão “não executado”. |

---

### S11 — Alimentos TACO `[DESKTOP]`

Empty até 2 letras. `arroz` → tabela. `zzzznaoexiste` → nenhum. Sem 500.

---

### S12 — Agenda `[DESKTOP + MOBILE]`

Calendário mês/lista. Criar consulta da seção 3. Sem título / fim antes do início → validação. Editar persiste. Widget de hoje mostra. Categoria `QA retorno`. Mobile: dialog cabe na tela.

---

### S14 — Configurações `[DESKTOP]`

Abas: Plano alimentar, Aparência, Aplicativo Paciente, Assinatura. Salvar nome + instruções de IA. Toggle de tema claro/escuro em todo o app. Toggles do app do paciente persistem. Conferir a aba Assinatura **em cada fase** (C1B.4, C1D.4, C1G, C2B.4).

---

### S15 — Funcionários `[DESKTOP]`

Empty decente. Essencial: cadeado. Pro/trial: dialog nome+e-mail. Não convide e-mail real de cliente. Limite de 2 assentos no Pro → modal “Limite de funcionários”.

---

### S16 — Contabilidade `[DESKTOP]`

Mês atual, nova receita 150, despesa, totais batem, categorias `QA honorários`. Gráfico renderiza. Essencial **consegue** entrar — se a landing vendeu como Pro, S3 de copy.

---

### S17 — Suporte (no máximo 1 envio)

Dialog no sidebar, e-mail pré-preenchido, categorias em português. 1 envio “Sugestão” curto de QA. Toast de sucesso.

---

### S20 — Regressão C2 `[DESKTOP + MOBILE]`

1. Paciente C2: cada aba abre; plano e consulta intactos.  
2. Tema escuro em `/patients`, `/agenda`, `/configuracoes`. Volte ao claro.  
3. 390px: lista, ficha (tabs), agenda, `/assinatura`.  
4. F5 em `/patients` mantém sessão Pro.

---

## 9. O que **não** testar

- App iOS/Android nativo (só `/download-app`).
- Esperar os 7 dias do trial acabarem (a C1 converte **durante** o trial).
- Downgrade / cancelar assinatura.
- WCAG completo.
- Carga de servidor (anote se uma tela passar de ~8s).

---

## 10. Inconsistências conhecidas (confirmar na UI)

| Tema | Marketing | Cobrança / app |
|---|---|---|
| Essencial mensal | R$ 59 | R$ 39 |
| Pro mensal | R$ 97 | R$ 79 |
| IA no Pro | até 200/mês | 200/mês |
| Contabilidade | Pro | sem ProGate |
| Trial | 7 dias | entitlements de Pro |

Se a produção já estiver alinhada, não reporte.

---

## 11. Prefixo de achado

```
[C1E][S3][1440][C1/essencial] URL=/employees | Novo funcionário | Esperado: cadeado Pro | Obtido: botão liberado
```

---

## 12. Limpeza

Não cancele as assinaturas (são o artefato do teste). Não apague as contas. Pode apagar consulta/transação QA se quiser; pacientes podem ficar.

Anote no relatório os dois e-mails para o humano cancelar depois no Asaas/painel, se quiser.

---

## 13. Relatório (formato obrigatório)

```markdown
# Relatório E2E iNutri Web — AAAA-MM-DD

## Resumo
- Ambiente / URLs
- Viewports
- Conta C1: e-mail, senha, fases concluídas (trial / essencial / upgrade Pro), valores cobrados
- Conta C2: e-mail, senha, Pro direto, valor cobrado
- Suítes puladas + motivo
- Totais S1–S4
- Veredito: aprovado com ressalvas | reprovado | bloqueado

## Jornada de billing
- C1 trial: o que aconteceu (loop? faixa? status)
- C1 → Essencial: método, valor, status final
- C1 → Pro: preview da diferença vs cobrado, status final, gates reabertos?
- C2 Pro direto: trial realmente pulado? valor? status
- Recibos de e-mail: sim/não

## O que funciona
- bullets

## Achados
### [S1] título
- Suíte / URL / viewport / conta / fase
- Passos / esperado / obtido / evidência

## Inconsistências de produto (preço, plano, copy)
- …

## Não testado
- …

## Risco residual
- …
```

Entregue esse relatório como resposta final da sessão no Chrome.
