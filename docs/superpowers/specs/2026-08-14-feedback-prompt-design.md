# Feedback do nutricionista e avaliação do app do paciente — Design

**Date:** 2026-08-14
**Branch:** `feat/feedback-prompt` (off main)
**Status:** Approved design — ready for implementation plan

Coletar opinião do nutricionista no dashboard (nota 1–5 + texto) e pedir avaliação na loja ao paciente, sem mandar quem está insatisfeito para a Play/App Store. O servidor é dono do ciclo: quando mostrar, quando adiar, quando parar.

## Decisões (do brainstorming)

- Persistir no banco **e** enviar e-mail ao time (mesmo Resend do suporte).
- Fechar sem enviar = folga de 7 dias; segunda recusa = nunca mais.
- Semana do paciente conta do **primeiro login no app**, não de `User.createdAt`.
- Prompt automático só para o nutricionista dono da conta. Funcionário nunca vê.
- Paciente responde 1–5. Nota 4–5 tenta review nativo e cai na ficha da loja. Nota 1–3 só texto para o time.
- Comentário sempre opcional.
- Sem painel admin, sem item de menu novo, sem banner persistente, sem várias rodadas.

## Objetivo

| Superfície | Quem | Gatilho | O que pede | Destino |
|---|---|---|---|---|
| Web | `NUTRITIONIST` | 72h após `User.createdAt` | Nota 1–5 + texto opcional | `UserFeedback` + e-mail |
| Mobile | `PATIENT` | 168h após `PatientProfile.firstAppLoginAt` | Nota 1–5 + texto opcional; 4–5 abre a loja | `UserFeedback` + e-mail; loja só se 4–5 |
| Web | `EMPLOYEE` | — | — | GET sempre `shouldShow: false`; POST 403 |

Janelas são durações exatas no relógio do servidor (`now()`), não “dias de calendário”.

## Modelo

### `PatientProfile.firstAppLoginAt DateTime?`

Nulo até a primeira chamada autenticada do paciente a `GET /v1/feedback/prompt`. Aí grava `now()` e não atualiza de novo. Paciente criado pelo nutricionista permanece nulo até abrir o app.

Pacientes que já usam o app não têm data histórica: o primeiro GET depois do deploy vira o marco, e a janela de 168h conta daí. Sem backfill.

### `UserFeedback`

No máximo uma linha por usuário. Criada na primeira interação (envio ou dismiss). Sem linha = ainda não interagiu.

```prisma
enum FeedbackSource {
  WEB
  MOBILE
}

model UserFeedback {
  id           String          @id @default(uuid())
  userId       String          @unique
  user         User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  rating       Int?
  comment      String?
  source       FeedbackSource?
  dismissCount Int             @default(0)
  snoozedUntil DateTime?
  resolvedAt   DateTime?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
}
```

| Campo | Significado |
|---|---|
| `rating` | 1–5 no envio; nulo se só dismissou |
| `comment` | Texto trimado; string vazia vira `null` |
| `source` | Preenchido no envio, derivado do **role** (`NUTRITIONIST` → `WEB`, `PATIENT` → `MOBILE`). Nulo se só dismissou |
| `dismissCount` | 0, 1 ou 2 |
| `snoozedUntil` | `now() + 168h` após o primeiro “agora não” |
| `resolvedAt` | Preenchido no envio **ou** na segunda recusa. A partir daí o prompt nunca volta |

Relação `User.feedback UserFeedback?`. Apagar o `User` apaga o feedback (`onDelete: Cascade`).

## Máquina de estados

`shouldShow` (computado no GET):

1. Role `EMPLOYEE` → `false`.
2. Existe linha com `resolvedAt` ≠ null → `false`.
3. Existe linha com `snoozedUntil` no futuro → `false`.
4. `NUTRITIONIST` e `now() < user.createdAt + 72h` → `false`.
5. `PATIENT` e `firstAppLoginAt` era nulo → stamp `now()`, `false` nesta visita.
6. `PATIENT` e `now() < firstAppLoginAt + 168h` → `false`.
7. Caso contrário → `true`.

Transições:

| Ação | Efeito |
|---|---|
| Primeiro dismiss (sem linha, ou `dismissCount = 0`) | Upsert: `dismissCount = 1`, `snoozedUntil = now() + 168h` |
| Segundo dismiss (`dismissCount ≥ 1`) | `dismissCount = 2`, `resolvedAt = now()` |
| Submit | `rating`, `comment`, `source`, `resolvedAt = now()`. E-mail ao time |
| Submit ou dismiss com `resolvedAt` já preenchido | **409** |

Não há PATCH. Não se edita nota. Uma chance por usuário.

## API

Módulo `apps/api/src/feedback/`. Types em `packages/shared-types/src/v1/feedback.ts`. Autenticado. Swagger no padrão dos outros controllers.

Nutricionista: as três rotas com `@BillingExempt()` — o prompt não depende da assinatura. O **cliente web** só monta o dialog depois de `BillingGate` e `OnboardingGate`, para não empilhar com checkout.

Paciente: as três rotas, sem billing.

Funcionário: GET permitido e sempre `shouldShow: false` (e **não** stamp de `firstAppLoginAt`). POST `/feedback` e POST `/dismiss` → **403**.

### `GET /v1/feedback/prompt`

Único side-effect: stamp de `firstAppLoginAt` no paciente, se nulo.

```ts
export type FeedbackSource = 'WEB' | 'MOBILE';

export interface FeedbackPromptResponse {
  shouldShow: boolean;
  source: FeedbackSource; // NUTRITIONIST → WEB, PATIENT → MOBILE, EMPLOYEE → WEB
}
```

### `POST /v1/feedback`

```ts
export interface SubmitFeedbackRequest {
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}

export interface SubmitFeedbackResponse {
  ok: true;
}
```

- `rating` obrigatório, inteiro 1–5. Fora disso → **400**.
- `comment` opcional, trim, máximo 2000 caracteres. Vazio → `null`.
- `source` **não** vem do cliente; sai do role.
- Já resolvido → **409**.
- E-mail: env ausente → **503**; Resend falha → **502**. Se o e-mail falhar, **não** escreve `rating` / `comment` / `source` / `resolvedAt`. Uma linha de dismiss anterior permanece como está, e o prompt continua elegível. Ordem: enviar e-mail → só então upsert desses campos. Se o persist falhar depois do e-mail (raro), a próxima tentativa pode gerar um segundo e-mail; aceitável.
- HTTP **201**.

### `POST /v1/feedback/dismiss`

Sem body. Resposta `{ ok: true }`. Já resolvido → **409**.

Não manda e-mail.

## E-mail

Reusa `ResendService` + `SUPPORT_INBOX_EMAIL` + `SUPPORT_FROM_EMAIL` + `RESEND_API_KEY`. Sem env novo.

- Destino: `SUPPORT_INBOX_EMAIL`
- From: `SUPPORT_FROM_EMAIL`
- `reply_to`: e-mail da conta
- Subject: `[iNutri Feedback] {n}/5 — {nome}`
- Corpo texto:

```
Nota: {n}/5
Comentário: {comment ou "—"}
Origem: {WEB|MOBILE}
Usuário: {nome} <{email}>
Role: {NUTRITIONIST|PATIENT}
User ID: {id}
Enviado em: {ISO-8601}
```

Dismiss não envia. Sem e-mail de confirmação ao usuário.

## Web (nutricionista)

Client component no layout autenticado (`apps/web/src/app/(app)/layout.tsx`), **depois** de `BillingGate` e `OnboardingGate`. Só monta a query se `me.role === 'NUTRITIONIST'`.

Dialog modal (shadcn `Dialog`, mesmo padrão do suporte). Não é banner. Não bloqueia o dashboard.

- Título: `O que você está achando do iNutri?`
- Texto: `Sua opinião nos ajuda a melhorar. Tem alguma sugestão ou encontrou algum problema?`
- Estrelas 1–5 (inteiras, obrigatórias para enviar)
- Textarea: `Sugestão ou correção (opcional)`
- Botões `rounded-full`: **Agora não** / **Enviar**

Comportamento:

- GET em loading ou `shouldShow: false` → zero UI.
- GET falhou → silêncio, sem dialog.
- Enviar sem nota → botão desabilitado.
- Enviar ok → toast de obrigado, fecha.
- Enviar falhou → toast de erro, dialog aberto.
- **Agora não**, X ou Esc → `POST /dismiss` e fecha. Falha do dismiss não impede o close; o próximo GET corrige o estado.
- Sem item novo no menu. Quem quiser falar depois usa o Suporte existente.

## Mobile (paciente)

Mesmo dialog (componente próprio, não `Alert.alert`), montado no layout autenticado **depois** do `ConsentGate`. Sempre chama `GET /v1/feedback/prompt` quando há sessão (é o que grava `firstAppLoginAt`).

- Título: `O que você está achando do iNutri?`
- Texto: `Sua opinião nos ajuda a melhorar o app.`
- Estrelas 1–5, textarea opcional, **Agora não** / **Enviar**.

Depois do `POST /feedback` 201:

| Nota | Cliente |
|---|---|
| 4 ou 5 | Toast de obrigado. `expo-store-review`: se `isAvailableAsync()` então `requestReview()`. Se indisponível, abre a ficha da loja. |
| 1 a 3 | Só o toast. Não abre loja nem chama `requestReview`. |

URLs da loja (já usadas em `apps/web/src/app/(auth)/download-app/page.tsx`):

- iOS: `https://apps.apple.com/br/app/inutri-pacientes/id6789184541`
- Android: `market://details?id=com.inutri.app`, fallback `https://play.google.com/store/apps/details?id=com.inutri.app`

Colocar `appleAppId: '6789184541'` e o package (já `com.inutri.app`) em `app.config.js` `extra`, para o cliente mobile não hardcodar solto.

Se o review nativo e o link da loja falharem, o toast já saiu e o prompt está resolvido. Não reabre.

Dismiss (Agora não / fechar): igual ao web. Sem entrada em Configurações nesta versão.

Dependência nova: `expo-store-review` (compatível com Expo 54).

## Erros

| Caso | API | Cliente |
|---|---|---|
| GET falhou | 5xx | Sem dialog |
| Rating inválido | 400 | Botão nem dispara (validação local) |
| Já resolvido | 409 | Fecha; trata como “já feito” |
| Env de e-mail ausente | 503 | Toast, dialog aberto |
| Resend falhou | 502 | Toast, dialog aberto |
| Dismiss falhou | 5xx | Fecha mesmo assim |
| Funcionário no POST | 403 | Não monta o dialog |

## Testes

API (`feedback.service.spec.ts` e controller se o padrão do módulo exigir):

- Nutricionista com conta < 72h → `shouldShow: false`; ≥ 72h sem linha → `true`.
- Paciente: primeiro GET stamp `firstAppLoginAt` e `false`; 168h depois → `true`.
- Funcionário → `shouldShow: false`; POST 403.
- 1º dismiss → snooze 168h e `shouldShow: false`; após o snooze → `true`; 2º dismiss → resolvido para sempre.
- Submit grava rating/comment/source/`resolvedAt` e chama Resend.
- Submit/dismiss depois de resolvido → 409.
- Resend lança → 502; `resolvedAt` e `rating` não são gravados (linha de dismiss, se existir, fica intacta).
- `comment` vazio vira `null`; > 2000 chars → 400.

Web:

- Dialog só renderiza com `shouldShow: true` e role nutricionista.
- Sem nota, Enviar desabilitado.
- Agora não / fechar chama dismiss.

Mobile:

- 4–5 chama `requestReview` quando disponível; senão abre a URL da loja da plataforma.
- 1–3 não chama review nem Linking da loja.
- Fechar chama dismiss.

## Fora de escopo

- Painel interno / listagem de feedbacks
- Editar ou reenviar nota
- Prompt para funcionário
- Banner persistente no dashboard
- Item de menu “Avaliar” / “Feedback”
- Várias campanhas ou versão do prompt
- E-mail de confirmação ao usuário
- Contar “uso real” além do primeiro login (sessões, abertura diária)
- Pedir review de novo depois de uma atualização do app

## Componentes tocados

| Área | Arquivos (esperados) |
|---|---|
| Prisma | `schema.prisma` + migration (`UserFeedback`, `firstAppLoginAt`) |
| Shared types | `packages/shared-types/src/v1/feedback.ts` + reexport |
| API | `apps/api/src/feedback/*`, registro em `app.module.ts` |
| Web | `components/feedback/feedback-dialog.tsx`, query, montagem no `(app)/layout.tsx` |
| Mobile | `components/feedback/feedback-prompt.tsx`, query, montagem no `(app)/_layout.tsx`, `expo-store-review`, `app.config.js` extra |
