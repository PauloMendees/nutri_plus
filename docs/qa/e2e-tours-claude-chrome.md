# Plano de testes E2E — Tours de produto / Primeiros passos (Claude no Chrome)

Playbook para o Claude no Chrome testar **todos os tours de onboarding** do iNutri Web: o hub `/primeiros-passos`, o modal de 1º acesso e os 5 tours (Pacientes, Agenda, Contabilidade, Alimentos, Configurações) — incluindo os fluxos "de usuário real" que já quebraram o tour no passado (salvar direto sem clicar Próximo, fechar dialogs no meio, replay, F5, deep links).

**Ambiente padrão:** local — os tours do ciclo 2 vivem na branch `feat/web-onboarding-tours-2` (PR #69).
**URL:** `http://localhost:3001` (API em `http://localhost:8080`)
**Produção (`https://inutri.life`):** só tem o tour Pacientes até o PR #69 ser mergeado e deployado. Se testar produção antes disso, execute apenas T01–T02, T08–T09 e T11.1.

Complementa (não substitui) o playbook geral `docs/qa/e2e-claude-chrome.md` — protocolos de e-mail e severidade são os mesmos.

---

## 0. Como usar

1. Suba o ambiente local na branch do PR (`pnpm dev` da API e do web) com banco migrado.
2. Deixe aberta uma aba do provedor de e-mail de teste (plus-addressing) — cadastro exige confirmação.
3. Abra o Chrome com a extensão Claude em `http://localhost:3001`.
4. Cole o **Prompt mestre** da seção 1 preenchido e anexe este arquivo.
5. O agente executa na ordem da seção 5. Não para no primeiro bug.
6. No fim, relatório no formato da seção 8.

Retomar sessão: *"Retome `docs/qa/e2e-tours-claude-chrome.md` na próxima suíte não executada. As contas criadas estão no log."*

---

## 1. Prompt mestre (cole no Claude do Chrome)

```
Você é um QA sênior testando os TOURS DE ONBOARDING do iNutri Web no Chrome.
Execute o plano abaixo de ponta a ponta. Não escreva código. Não "corrija" a aplicação. Só navegue, clique, preencha, observe e registre.

OBJETIVO
Validar o hub /primeiros-passos, o modal de 1º acesso e os 5 tours guiados — no caminho feliz E nos caminhos de usuário real (salvar sem clicar Próximo, fechar dialog no meio, replay, pular, sair, F5, deep link, funcionário). Encontrar TODOS os problemas visíveis.

CONFIG (preencha antes de começar)
- BASE_URL: http://localhost:3001
- VIEWPORTS: 1440×900 (e 390×844 só na T12.6)
- EMAIL_BASE: ___            (plus-addressing: local+t1-TS@dominio etc.)
- INBOX: aba aberta em ___
- SENHA_NOVAS_CONTAS: QaInutri!2026a
- TS: YYYYMMDDHHMM do início

CONTAS (crie nesta sessão; trial de 7 dias, SEM cartão — dá entitlements de Pro)
- N1 "QA Tour N1 TS": fluxo canônico dos 5 tours (sempre seguindo o holofote).
- N2 "QA Tour N2 TS": fluxos adversariais (progresso de tour NÃO tem reset — esta conta precisa começar virgem em cada tour indicado).
- E1: funcionário convidado pela N1 (aceite o convite em janela anônima).

REGRAS
1. Execute na ordem da seção 5. Não pule suíte sem motivo no relatório.
2. Não pare no primeiro bug. Anote e continue.
3. Bug: URL, conta, suíte, passos, esperado vs obtido, severidade S1–S4 (tabela do playbook geral), screenshot.
4. ANTES de reportar, confira a seção 7 (limitações conhecidas) — comportamento listado lá não é bug novo.
5. Em todo passo de tour: o tooltip aparece perto do elemento iluminado, em pt-BR, com os botões certos (Pular capítulo, Sair, e Próximo ou Preencher com dados fictícios quando aplicável)?
6. "Não encontrei este passo" fora dos casos previstos = S2 no mínimo.
7. Pacientes-demo usam os dados que o próprio tour preenche (Maria Demonstração). Não invente e-mails reais.
8. NUNCA pague nada. NUNCA cancele assinatura. Só trial.
9. Console aberto: erro vermelho de React durante um tour = anote com o passo exato.

Comece pela T00 na conta N1, recém-onboardada (trial iniciado).
```

---

## 2. Mapa do que está sendo testado

### Hub e entrada

| Item | Esperado |
|---|---|
| Sidebar | Item **Primeiros passos** entre Contabilidade e Configurações |
| `/primeiros-passos` | 5 cards, nesta ordem: **Pacientes, Agenda, Contabilidade, Alimentos, Configurações** |
| Card | Título, resumo, grade de capítulos com estado (A fazer / Em andamento / Concluído / Pulado / Bloqueado), CTA Começar/Continuar/Concluído+Rever |
| Modal 1º acesso | "Conheça o iNutri" — só aparece uma vez, em conta recém-onboardada sem nenhum tour começado. "Agora não" dispensa para sempre; "Ver primeiros passos" navega ao hub |
| Funcionário | Vê os 5 cards; **pode iniciar** Agenda e Contabilidade; Pacientes/Alimentos/Configurações com CTA desabilitado + texto explicativo |

### Os 5 tours (capítulos)

| Tour | Capítulos | Cria dados? |
|---|---|---|
| Pacientes | Lista, Cadastro, Ficha, Anamnese, Bioimpedância, Metas, Recordatório e diário, Plano manual, Gerar com IA | Paciente-demo "Maria Demonstração" (badge **Demo**), anamnese, avaliação, recordatório, plano, rascunho IA |
| Agenda | Visão geral, Agendamento, Categorias | Agendamento "Consulta de demonstração" (amanhã 09:00–10:00, vinculado ao paciente-demo se existir) |
| Contabilidade | Extrato, Lançamento, Categorias | Receita R$ 100,00 "Lançamento de demonstração" |
| Alimentos | Busca | Nada (read-only) |
| Configurações | Plano alimentar, Aparência, Aplicativo, Assinatura | **Nada** — nenhum salvamento |

### Mecânica do motor (o que observar em todo tour)

- Passo `Próximo` = só leitura; passo iluminado clicável = o clique real acontece E avança o tour.
- **"Preencher com dados fictícios"** preenche o formulário e **avança o holofote para o botão Salvar** (comportamento novo).
- **Salvar direto sem clicar Próximo** (do passo do formulário) deve concluir/avançar o capítulo normalmente — nunca "Não encontrei este passo" (bug corrigido; regressão = S2).
- Replay ("Rever") nunca altera progresso nem cria segunda entidade.
- Capítulo concluído/pulado nunca volta atrás.

---

## 3. Dados de teste

| Campo | Valor |
|---|---|
| Fixture do tour Pacientes | O tour preenche sozinha (Maria Demonstração) — use o botão |
| Fixture Agenda | Título "Consulta de demonstração", amanhã 09:00–10:00 |
| Fixture Contabilidade | Receita 100,00, hoje, "Lançamento de demonstração" |
| Fixture Alimentos | Busca "arroz" |
| Categoria agenda (T07.3) | `QA cat tour TS` |
| Categoria financeira (T07.4) | `QA fin tour TS` |

---

## 4. Preparação das contas

1. **N1**: signup → confirmar e-mail → `/assinatura` → **Começar teste grátis (7 dias)** → cai no painel. NÃO dispense nada ainda: a T01 testa o modal de 1º acesso.
2. **N2**: idem, criada só quando a T07 começar (precisa do modal/tours virgens).
3. **E1**: com a N1 (trial = Pro), `/employees` → Novo funcionário → convite para e-mail de teste → aceitar em janela anônima → login como funcionário.

---

## 5. Ordem de execução (obrigatória)

```
T00  Hub e sidebar                      (N1)
T01  Modal de 1º acesso                 (N1, recém-criada)
T02  Tour Pacientes completo — canônico (N1)
T03  Tour Agenda — canônico             (N1)
T04  Tour Contabilidade — canônico      (N1)
T05  Tour Alimentos                     (N1)
T06  Tour Configurações                 (N1)
T07  Fluxos adversariais nos dialogs    (N2, tours virgens)  ← regressão dos bugs corrigidos
T08  Replay / Rever                     (N1, tours concluídos)
T09  Pausar, sair, F5, deep links       (N2)
T10  Funcionário                        (E1)
T11  Limpeza das entidades-demo        (N1 e N2)
T12  Robustez geral                     (qualquer conta)
Relatório
```

---

## 6. Suítes

### T00 — Hub e sidebar (N1)

| # | Passo | Esperado |
|---|---|---|
| 0.1 | Sidebar → Primeiros passos | `/primeiros-passos`, heading "Primeiros passos" |
| 0.2 | Contar cards | 5, na ordem Pacientes → Configurações |
| 0.3 | Cada card | Resumo em pt-BR; CTA **Começar** habilitado (N1 é nutricionista em trial). Nos 4 tours sem capítulo dependente de demo, capítulos todos "A fazer". No card **Pacientes**, só Lista e Cadastro ficam "A fazer" — os capítulos 3–9 (Ficha até Gerar com IA) aparecem **"Bloqueado"**, com a razão visível no próprio card: "Cadastre o paciente de demonstração primeiro." |
| 0.4 | Capítulo "Gerar com IA" (card Pacientes) | Bloqueado nesta conta virgem — mas pela falta do paciente-demo, não por cota de IA/plano (trial = Pro, sem bloqueio de plano) |
| 0.5 | Nenhum banner de "apagar demonstração" ainda | Correto (nada foi criado) |

### T01 — Modal de 1º acesso (N1 recém-criada)

| # | Passo | Esperado |
|---|---|---|
| 1.1 | Primeira tela do app após o trial | Modal **"Primeiros passos no iNutri"** com **Ver primeiros passos**, **Agora não** e um **X** de fechar no canto |
| 1.2 | "Ver primeiros passos" | Navega ao hub **e também dispensa o modal** (mesmo efeito de "Agora não"); não volta em F5 nem ao trocar de página |
| 1.3 | F5 no hub (depois de 1.2) | Modal NÃO reaparece |
| 1.4 | Em vez de 1.2, clicar **Agora não** (ou o **X**) | Dispensa da mesma forma → nunca mais aparece (nem após logout/login) |

### T02 — Tour Pacientes completo, canônico (N1)

Siga o holofote do início ao fim: Começar → 9 capítulos. Em cada formulário use **Preencher com dados fictícios** e depois o Salvar iluminado.

| # | Ponto de verificação | Esperado |
|---|---|---|
| 2.1 | Cadastro | Botão de fixture preenche Maria Demonstração e o holofote **pula para o Salvar**; salvar cria o paciente e abre a ficha; sem e-mail de convite real |
| 2.2 | Lista / ficha | Badge **Demo** ao lado do nome |
| 2.3 | Capítulos 3–8 | Cada aba abre pelo clique iluminado; fixtures preenchem; salvamentos reais funcionam |
| 2.4 | Gerar com IA | Tooltip avisa "consome 1 ação de IA"; confirmar gera rascunho (1 vez só nesta sessão) |
| 2.5 | Fim do tour | Volta ao hub; card Pacientes **Concluído** + Rever; banner "Este é um paciente de demonstração." com botão de apagar |
| 2.6 | Progresso | Todos os capítulos "Concluído"; F5 mantém |

### T03 — Tour Agenda, canônico (N1)

| # | Passo | Esperado |
|---|---|---|
| 3.1 | Capítulo Visão geral | 3 passos "Próximo" sobre título, toggle Mês/Lista e navegação |
| 3.2 | Agendamento: clique iluminado "Novo agendamento" → fixture → **Próximo** → Salvar iluminado | Cria "Consulta de demonstração" amanhã 09:00–10:00, **vinculada a Maria Demonstração** (T02 criou o demo); capítulo conclui e o tour segue para Categorias |
| 3.3 | Categorias | Passos: explicação da lista → clique "Nova categoria" → explicação do formulário (último passo). **Próximo** conclui o capítulo e o tour; feche o dialog com Cancelar |
| 3.4 | Hub | Card Agenda Concluído; banner "Este é um agendamento de demonstração." |
| 3.5 | Agenda real | O chip da consulta-demo aparece amanhã no calendário |

### T04 — Tour Contabilidade, canônico (N1)

| # | Passo | Esperado |
|---|---|---|
| 4.1 | Extrato | 4 passos "Próximo": título, gráfico 12 meses, cards de resumo, navegação de mês |
| 4.2 | Lançamento: "Nova transação" → fixture → Próximo → Salvar | Cria Receita R$ 100,00; o passo seguinte destaca a tabela com o lançamento visível e o saldo atualizado |
| 4.3 | Categorias | Igual T03.3 (termina no formulário; Cancelar fecha) |
| 4.4 | Hub | Card Concluído; banner "Este é um lançamento de demonstração." |

### T05 — Tour Alimentos (N1)

| # | Passo | Esperado |
|---|---|---|
| 5.1 | Busca | Fixture preenche "arroz" e avança; tabela TACO aparece com colunas nutricionais |
| 5.2 | Sem usar fixture (via Rever depois, ou N2) | Digitar manualmente ≥2 letras também permite avançar quando a tabela aparece |

### T06 — Tour Configurações (N1)

| # | Passo | Esperado |
|---|---|---|
| 6.1 | Antes de começar, anote: nome de exibição, instruções de IA, WhatsApp, estado dos toggles | — |
| 6.2 | 4 capítulos | Tabs Plano alimentar → Aparência → Aplicativo → Assinatura, cada uma com explicação; **o holofote nunca cai num botão Salvar** |
| 6.3 | Depois do tour | NENHUMA configuração mudou (compare com 6.1) |

### T07 — Fluxos adversariais nos dialogs (N2, tours virgens) ⚠️ regressão dos bugs corrigidos

Crie a N2 agora (seção 4). Dispense o modal de 1º acesso com "Agora não".

| # | Cenário | Esperado |
|---|---|---|
| 7.1 | **Agenda / Agendamento:** no passo do formulário, clique em "Preencher com dados fictícios" e depois **Salvar direto, SEM clicar Próximo** | Agendamento criado; capítulo **conclui normalmente** e o tour segue para Categorias. NUNCA "Não encontrei este passo" (regressão do bug = S2) |
| 7.2 | **Contabilidade / Lançamento:** preencha o formulário **manualmente** (sem fixture) e salve direto do passo do formulário | Lançamento criado; tour avança para o passo da tabela |
| 7.3 | **Agenda / Categorias:** no passo do formulário, preencha `QA cat tour TS` e clique **Salvar** (em vez de Cancelar) | Categoria criada; dialog fecha; clicar **Próximo** conclui o capítulo sem erro |
| 7.4 | **Contabilidade / Categorias:** no passo do formulário, clique **Cancelar** antes de clicar Próximo | Dialog fecha; **Próximo** conclui o capítulo sem erro |
| 7.5 | **Agendamento com salvamento inválido:** apague o título e tente salvar | Validação inline; dialog aberto; tour parado no mesmo passo; corrigir e salvar retoma o fluxo |
| 7.6 | **Pacientes / Cadastro:** fixture → Salvar direto sem Próximo | Paciente criado UMA vez; tour segue para Ficha; sem paciente duplicado na lista |
| 7.7 | Rode o tour Agenda de novo via Rever e confira a agenda | **Só um** "Consulta de demonstração" — replay não cria segundo (se a conta só tem 1 demo, ok) |

### T08 — Replay / Rever (N1, tours concluídos)

| # | Cenário | Esperado |
|---|---|---|
| 8.1 | Rever capítulo Cadastro (Pacientes) | O passo Salvar **não** cria segundo paciente — navega para a ficha do demo existente |
| 8.2 | Rever Agendamento (Agenda) | O clique em Salvar **não** submete — dialog fecha sozinho e o replay segue; nenhum agendamento novo |
| 8.3 | Rever Lançamento (Contabilidade) | Idem; extrato continua com um só lançamento-demo |
| 8.4 | Depois de todos os replays | Progresso idêntico ao de antes (capítulos Concluído continuam Concluído; nada "voltou") |
| 8.5 | Rever com cota de IA esgotada (se aplicável) | Capítulo IA concluído continua revisível; capítulo IA não-feito fica Bloqueado com tooltip |

### T09 — Pausar, sair, F5, deep links (N2)

| # | Cenário | Esperado |
|---|---|---|
| 9.1 | Comece o tour Pacientes; no passo "Novo paciente" (último passo de Lista), clique **Sair** SEM clicar em "+ Novo paciente" | Tour fecha; query string some; hub mostra Lista **Em andamento** (não "Concluído" — um capítulo só vira "Concluído" quando o clique do ÚLTIMO passo acontece; Sair antes disso é o comportamento correto); CTA **Continuar** |
| 9.2 | **Continuar** | Retoma em Lista (primeiro capítulo não-terminal), não do zero |
| 9.3 | **Pular capítulo** num capítulo qualquer | Vira "Pulado"; tour segue ao próximo; Pulado nunca vira "A fazer" de novo |
| 9.4 | **F5 em qualquer passo do tour** (toda navegação do motor agora carrega `?tour=...&chapter=...` na URL) | Tour sempre re-hidrata no mesmo capítulo; sem erro |
| 9.5 | Deep link `?tour=patients&chapter=ficha` sem paciente-demo | Não trava: vai ao hub (ou pede o cadastro) |
| 9.6 | Deep link `?tour=inexistente&chapter=x` | Ignorado sem crash |
| 9.7 | Navegar pelo sidebar no MEIO de um passo (ex.: ir para Contabilidade durante o tour Agenda) | Comportamento aceitável: aviso "Não encontrei este passo" + **Voltar ao hub** funcional. Progresso preservado |

### T10 — Funcionário (E1)

| # | Cenário | Esperado |
|---|---|---|
| 10.1 | Hub como funcionário | 5 cards; Pacientes/Alimentos/Configurações com Começar desabilitado + texto "Este tutorial é feito pelo nutricionista (…)" |
| 10.2 | Iniciar **Agenda** | Funciona de ponta a ponta (funcionário tem escrita na agenda) |
| 10.3 | Iniciar **Contabilidade** | Funciona |
| 10.4 | Deep link `?tour=configuracoes&chapter=plano-alimentar` como funcionário | Redireciona ao hub; nada inicia |
| 10.5 | Progresso do funcionário | Independente do progresso da N1 (cada usuário tem o seu) |

### T11 — Limpeza das entidades-demo

| # | Cenário | Esperado |
|---|---|---|
| 11.1 | Hub N1 → "Apagar paciente de demonstração" → Confirmar exclusão | Paciente some da lista **e o agendamento-demo vinculado some da agenda** (cascade); banner do paciente desaparece |
| 11.2 | Depois de 11.1, card Agenda | Se o agendamento-demo foi apagado junto, o banner de agendamento também some (ponteiro zera) |
| 11.3 | "Apagar lançamento de demonstração" | Lançamento some do extrato; banner some |
| 11.4 | Apagar a entidade-demo **pela UI normal** (N2: excluir o agendamento pelo dialog da agenda) | Banner do hub some sozinho no próximo carregamento |
| 11.5 | Após apagar o paciente-demo, hub → card Pacientes (tour IN_PROGRESS **ou COMPLETED**) | O botão do capítulo Cadastro oferece refazer o cadastro (recovery) **mesmo com o tour Concluído** — roda em modo *play* (não replay) e recria o demo; capítulos 3–9 ficam bloqueados com "Cadastre o paciente de demonstração primeiro." |
| 11.6 | Refazer o Cadastro via recovery | Cria novo demo; capítulos voltam a ficar acessíveis; status dos capítulos concluídos NÃO regrediu (se o tour já estava Concluído, continua Concluído) |
| 11.7 | Apagar agendamento-demo e rever o capítulo Agendamento | **Não recria** (decisão de produto): replay intercepta o salvar normalmente |

### T12 — Robustez geral

| # | Cenário | Esperado |
|---|---|---|
| 12.1 | Overlay do tour | Não bloqueia digitação nos campos do formulário iluminado; botões do tooltip sempre clicáveis |
| 12.2 | Esc/X fechando o dialog **no passo Salvar** (awaitAction) | Comportamento esperado (seção 7): após ~15s sem a âncora, aparece "Não encontrei este passo" + **Voltar ao hub** — não fica mais em silêncio. Anote SÓ se acontecer algo pior (crash, avanço indevido, dados errados, ou o fallback não aparecer) |
| 12.3 | Tema escuro durante um tour | Tooltip e holofote legíveis |
| 12.4 | Console durante cada tour | Sem erro vermelho de React/hydration |
| 12.5 | Dois tours "ao mesmo tempo": no meio do tour Agenda, abrir o hub e clicar Começar em Contabilidade | Sessão anterior é substituída de forma limpa (sem dois holofotes, sem PATCH cruzado) |
| 12.6 | Mobile 390px: hub + 1 capítulo de Agenda | Cards empilham; tooltip cabe na tela; sem scroll horizontal |
| 12.7 | Rodar o tour Agenda 2x na mesma conta (via recovery ou N2) | Se já existe consulta amanhã 09:00, salvar pode dar conflito 409 — mensagem amigável, tour não avança, usuário pode ajustar o horário e salvar |

---

## 7. Limitações conhecidas (NÃO reportar como bug novo)

| Comportamento | Status |
|---|---|
| Fechar o dialog no passo **Salvar** mostra "Não encontrei este passo" + **Voltar ao hub** após ~15s | Esperado (fallback do motor). Reporte só se aparecer antes dos ~15s, ou se o botão Voltar ao hub não funcionar |
| Submeter com **Enter** durante um **replay** de capítulo que cria dados pode criar entidade real órfã (sem banner) | Conhecido (intercept é de clique) |
| Rever Agendamento/Lançamento com a entidade-demo apagada **não recria** | Decisão de produto (recovery só existe no Cadastro de Pacientes) |
| "Não encontrei este passo" ao navegar manualmente para outra página no meio de um passo | Esperado; o botão Voltar ao hub deve funcionar |
| Busca de Alimentos com API lenta pode estourar o timeout de 5s do passo da tabela | Conhecido (margem estreita); anote o tempo se ocorrer |

---

## 8. Relatório (formato obrigatório)

```markdown
# Relatório E2E Tours iNutri — AAAA-MM-DD

## Resumo
- Ambiente / branch / commit
- Contas: N1, N2, E1 (e-mails)
- Suítes executadas / puladas + motivo
- Totais S1–S4
- Veredito: aprovado | aprovado com ressalvas | reprovado

## Regressão dos bugs corrigidos (T07)
- 7.1–7.7: passou/falhou, um por linha

## O que funciona
- bullets

## Achados
### [S2] título
- Suíte / URL / conta / passos / esperado / obtido / screenshot

## Limitações conhecidas observadas (seção 7)
- quais ocorreram, com contexto

## Não testado
- …
```
