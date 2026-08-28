# AI em segundo plano — Design

Status: proposto (2026-08-28)
Constrói sobre `docs/superpowers/specs/2026-06-17-ai-meal-generation-design.md`
(geração) e o padrão assíncrono já em uso na transcrição de consulta
(`apps/api/src/patients/audios/audios.service.ts`).

## Objetivo

Tirar a nutricionista da espera. Hoje gerar ou ajustar um plano com IA prende o
diálogo aberto até a resposta chegar — e a chamada ficou mais lenta desde a troca
de modelo. Depois desta mudança ela dispara, fecha o diálogo, segue atendendo, e
é avisada quando o resultado está pronto.

## Comportamento atual, e a assimetria que ele impõe

Os dois fluxos terminam em lugares diferentes:

- `MealGenerationService.generate()` **persiste** um `MealPlan`
  (`aiGenerated=true`) via `createGeneratedPlan` e devolve o registro.
- `MealGenerationService.adjust()` devolve um **rascunho não persistido**, que só
  existe na resposta HTTP até a nutricionista revisar e salvar.

Geração em segundo plano seria trivial — o plano já aparece na lista sozinho.
Ajuste não: se o diálogo fecha, o rascunho evapora. É essa assimetria que motiva
uma tabela de jobs em vez de um simples "dispare e esqueça".

## Escopo

**Entra:** geração e ajuste em segundo plano, aviso na tela ao concluir, retry
manual (falha e job travado), painel de processos em andamento na página do
paciente.

Segue em separado, como mudança bounded de prompt e não parte deste subsistema:
o padrão de refeições da geração (Café da manhã, Almoço, Lanche e Jantar quando
nada no contexto indicar outra coisa), em `apps/api/src/ai/prompts/meal-plan.prompt.ts`.

**Fica de fora:** cancelar job em andamento, retry automático, e badge global de
trabalhos no cabeçalho. Cancelamento foi avaliado e descartado: só valeria com um
`AbortSignal` propagado até o SDK da OpenAI — sem isso a chamada roda até o fim e
é cobrada de qualquer forma — e a plumbing não se paga no volume atual.

## Modelo de dados

```prisma
enum AiJobType {
  MEAL_PLAN_GENERATION
  MEAL_PLAN_ADJUSTMENT
}

enum AiJobStatus {
  PENDING
  RUNNING
  DONE
  FAILED
}

model AiJob {
  id             String              @id @default(uuid())
  nutritionistId String
  nutritionist   NutritionistProfile @relation(fields: [nutritionistId], references: [id], onDelete: Cascade)
  patientId      String
  patient        PatientProfile      @relation(fields: [patientId], references: [id], onDelete: Cascade)

  type   AiJobType
  status AiJobStatus @default(PENDING)

  input  Json    // { instructions?, planId? } — o suficiente para repetir
  result Json?   // rascunho do ajuste; null na geração
  error  String?

  // Preenchido só na geração: o plano criado.
  mealPlanId String?
  mealPlan   MealPlan? @relation(fields: [mealPlanId], references: [id], onDelete: SetNull)

  createdAt  DateTime  @default(now())
  startedAt  DateTime?
  finishedAt DateTime?
  // Só no ajuste: marca que o rascunho já foi carregado no editor, para a faixa
  // "Ajuste pronto" não reaparecer a cada abertura do plano.
  consumedAt DateTime?

  @@index([patientId, createdAt])
  @@index([nutritionistId, status])
}
```

`patientId` é obrigatório nos dois tipos — no ajuste ele é derivado do plano. É o
que permite o painel filtrar por paciente sem consulta extra.

`result` e `mealPlanId` são mutuamente exclusivos por tipo: cada fluxo usa o
campo que corresponde ao seu destino, e o mesmo mecanismo serve aos dois.

## Modelo de execução

Fire-and-forget no processo da API: o handler grava o job, responde, e dispara
`void this.runJob(id)` — exatamente o padrão de `runTranscription`. Nenhuma
infraestrutura nova; o Render roda uma instância, então não há concorrência entre
workers a resolver.

**Consequência aceita:** um deploy no meio de um job o deixa `RUNNING` para
sempre. A transcrição já convive com isso e resolve com "Tentar de novo" na linha
travada. Aplicamos o mesmo contrato: job `RUNNING` há mais de **10 minutos** é
apresentado como travado, com o mesmo botão de repetir. Não há varredura de
background corrigindo status — a leitura decide, o que evita um loop permanente
no processo.

## Retry

`POST /v1/ai/jobs/:id/retry` reaproveita a linha: volta o status para `PENDING`,
limpa `error`, `startedAt` e `finishedAt`, e dispara `runJob` de novo. Aceito
para jobs `FAILED` e para `RUNNING` travado (acima do limiar); rejeitado com 409
para `PENDING`, `DONE` e `RUNNING` recente.

Reaproveitar a linha em vez de criar outra mantém o histórico por paciente legível
— uma tentativa por linha, e não uma pilha de jobs quase idênticos.

## Cota de IA

A cota **não é um contador debitável**: `EntitlementsService.countUsage` conta
linhas de `AIInteraction` com `success: true` no mês corrente. Não há o que
debitar nem o que devolver.

O risco que o background introduz é outro: como a checagem só corre no momento da
chamada, seria possível enfileirar dezenas de jobs e só descobrir o estouro
quando cada um rodasse.

A correção mantém o mecanismo derivado e soma o que está em voo:

```
usadas = AIInteraction(success, tipos de IA, mês)  +  AiJob(PENDING | RUNNING, mês)
```

`assertAiActionQuota` passa a usar essa soma, e é chamada **na criação do job**,
não dentro de `runJob`. Assim:

- Enfileirar fica limitado pela cota, que era o buraco.
- Falha "devolve" sozinha: o job sai do conjunto ativo e nenhuma interação
  bem-sucedida foi gravada. Sem lógica de estorno.
- Retry volta a contar enquanto roda, pelo mesmo caminho.

`AIInteraction` continua registrando cada chamada como hoje. A telemetria de
custo não muda.

## API

```txt
POST /v1/ai/generate-meal-plan   → 202 { jobId }
POST /v1/ai/adjust-meal-plan     → 202 { jobId }
GET  /v1/ai/jobs/:id             → { id, type, status, mealPlanId?, result?, error? }
GET  /v1/ai/jobs?patientId=<id>  → PENDING, RUNNING e FAILED das últimas 24 h
POST /v1/ai/jobs/:id/retry       → 202 { jobId }
```

Todos restritos a `NUTRITIONIST`, com a mesma checagem de posse do paciente que os
endpoints atuais usam.

Os dois POST existentes **mudam de contrato**: passam de `201` com o corpo pronto
para `202` com o `jobId`. O front é nosso e sai no mesmo deploy, então não há
versionamento a fazer — mas isso obriga a **subir a API antes do web**, como já
foi feito na mudança de preço.

## Frontend

**Diálogos.** `AiGenerateDialog` e `AiAdjustDialog` disparam, recebem o `jobId` e
fecham na hora, com um toast "Gerando em segundo plano…".

**Acompanhamento.** Um hook de polling consulta os jobs ativos do paciente a cada
2 s, e só enquanto houver ao menos um. Ao concluir: toast com ação e invalidação
da query de planos, que atualiza a lista sozinha.

**Painel no paciente.** Um bloco na página do paciente listando os jobs
`PENDING`, `RUNNING` e os `FAILED` das últimas 24 horas — renderizado **apenas quando há ao menos um**, para
não somar ruído à tela no caso comum. Cada linha traz o tipo, há quanto tempo
está rodando, e o botão de repetir quando cabe.

**Ajuste pronto.** Ao abrir o editor de um plano com job de ajuste `DONE` e
`consumedAt` nulo, aparece uma faixa "Ajuste pronto — revisar". Carregar o
rascunho no formulário marca `consumedAt`, para a faixa não reaparecer a cada
abertura. Descartar a faixa também marca — em ambos os casos a nutricionista já
viu a sugestão. Preserva a revisão antes de aplicar, que é o contrato que o produto
comunica: a IA sugere, a nutricionista conduz.

## Testes

- **Serviço:** `runJob` grava `DONE` com `mealPlanId` na geração e com `result`
  no ajuste; falha grava `FAILED` com mensagem.
- **Cota:** jobs ativos contam junto com as interações bem-sucedidas; criar job
  acima do teto responde 402; job que falhou deixa de contar sem estorno.
- **Retry:** aceito em `FAILED` e em `RUNNING` travado; 409 nos demais estados.
- **Posse:** job de outro nutricionista responde 404 na leitura e no retry.
- **Limiar de travado:** função pura sobre `startedAt`, testada sem relógio real.
- **Front:** diálogo fecha ao disparar; painel não renderiza sem jobs; polling
  para quando não há job ativo; faixa de ajuste pronto carrega o rascunho.

## Ordem de deploy

API antes do web, pelo contrato dos dois POST. Entre um e outro, o web antigo
receberia `202 { jobId }` onde espera um plano — janela curta, mas real.
