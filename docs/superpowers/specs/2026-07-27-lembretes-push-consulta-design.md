# Lembretes / Push ao Paciente (E1) — Design

**Date:** 2026-07-27
**Branch:** `feat/lembretes-push` (off main bf2eb1a; F, B, A/TACO, C/LGPD, D1, D2, transcrição-v2a todos mergeados)
**Status:** Approved design — ready for implementation plan

**Sub-projeto E, fase E1.** Primeiro caso de uso de notificações push ao paciente: **lembrete de consulta agendada** ("sua consulta é amanhã às 14h"), sobre uma infra de push greenfield. É o último sub-projeto do batch. Fases futuras (E2): outros tipos de lembrete (peso/medição, refeição), preferências por tipo, tela de agenda no app, horários silenciosos.

## Decisões (do brainstorming)

- **Âncora do MVP: lembrete de consulta** (maior valor — reduz falta; dado já existe em `Appointment.startsAt`). **Um lembrete, ~24h antes.**
- **Sem tela nova no app** — o push é autossuficiente (carrega a info); tocar abre o app. Não expõe agenda ao paciente no E1.
- **Opt-in explícito** — um toggle na tela **Configurações** (não registro silencioso no login). A presença do push token = opt-in; sem tabela de preferência.
- **Disparo: Render Cron → endpoint protegido** (a API já roda no Render; sem `@nestjs/schedule`). Um Cron Job chama de tempos em tempos um endpoint protegido por segredo.
- **Envio: Expo Push API** via `fetch` puro (sem dependência no servidor). **Mobile: nova dependência `expo-notifications`** (essencial p/ obter o token; aprovado).
- **Sem infra de fila** (mesma limitação da transcrição v2a) — o scan é idempotente e marca o que já enviou.

## Estado atual (o que reusar — não reinventar)

- **Mobile (Expo SDK 54, managed):** `app.config.js` com `projectId` EAS (`6b0a41da-…`) → Expo Push viável. `lib/api.ts` (`apiFetch` com bearer Supabase). `lib/queries/*` (react-query). Tela **Configurações** (`app/(app)/configuracoes/index.tsx`) + `senha.tsx` — padrão de tela de settings a seguir. gluestack-ui. `expo-secure-store` já em uso. **Não** há `expo-notifications` hoje.
- **API:** controllers paciente-scoped `me/*` (`me.controller`, `me-consent`, `me-nutrition-target`, `patient-meal-plans`, `patient-assessments`) — padrão `@Roles(UserRole.PATIENT)` + `resolveScopePatientId(ctx)`. `Appointment` (`nutritionistId`, `patientId?`, `startsAt`, `endsAt`, `title`). Vertical slice (Controller → Service → Repository). Endpoint público protegido por segredo: padrão do webhook do Chargebee (`?key=…`).
- **Deploy:** `render.yaml` (Blueprint; `type: web` `nutri-plus-api`, Docker, `preDeployCommand` roda `prisma migrate deploy`). Render suporta `type: cron`.
- **Consentimento (C1/C2):** padrão de opt-in/LGPD — push é opt-in.

## Modelo de dados (migração aditiva)

```prisma
model PatientPushToken {
  id        String   @id @default(uuid())
  patientId String
  patient   PatientProfile @relation(fields: [patientId], references: [id], onDelete: Cascade)
  token     String   @unique              // Expo push token (globalmente único por device)
  platform  String?                       // 'ios' | 'android'
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([patientId])
}
```
- `Appointment += appointmentReminderSentAt DateTime?` — dedup (um lembrete por consulta).
- `PatientProfile += pushTokens PatientPushToken[]` (back-relation).

*(Segue a convenção do schema do nutri_plus: campos camelCase, sem `@map`/`@db`, `@default(uuid())` — como `ConsultationAudio`.)*

shared-types (`v1/push.ts`): `PushPlatform = 'ios' | 'android'`; `RegisterPushTokenRequest { token: string; platform?: PushPlatform }`. (O token não é devolvido ao cliente numa listagem — o registro é fire-and-forget.)

## API

Novo módulo `notifications` (ou `push`), vertical slice.

**Paciente (opt-in):**
- **`PUT /v1/me/push-tokens`** (`@Roles(PATIENT)` + `resolveScopePatientId`) body `RegisterPushTokenRequest` → **upsert** por `token` (associa ao paciente atual; atualiza `platform`/`updatedAt`). Idempotente (re-registrar o mesmo token é no-op de conteúdo).
- **`DELETE /v1/me/push-tokens/:token`** (`@Roles(PATIENT)`) → apaga o token **do paciente atual** (scoped; token de outro paciente → 404/no-op). Opt-out / logout.

**Disparo (interno):**
- **`POST /v1/internal/reminders/dispatch`** — rota **pública protegida por segredo** (header `x-reminder-key` === `REMINDER_DISPATCH_KEY`; ausente/errado → 401). Faz o scan e envia:
  1. Seleciona `Appointment` com `patientId IS NOT NULL`, `appointmentReminderSentAt IS NULL`, `startsAt > now()` e `startsAt <= now() + 24h`.
  2. Para cada consulta: busca os `PatientPushToken` do `patientId`. Se **não houver** token (paciente não optou) → **pula sem marcar** (pra funcionar se ele optar dentro da janela). Se houver → envia o push a cada token e, havendo ao menos um envio bem-sucedido, marca `appointmentReminderSentAt = now()`.
  3. Corpo do push: título "Lembrete de consulta", corpo "Sua consulta \"{title}\" é {data/hora em America/Sao_Paulo}." + `data: { appointmentId }`.
  - Retorna um resumo (ex.: `{ scanned, sent, tokensRemoved }`) — sem PII.

**Envio — `ExpoPushService`:** POST `https://exp.host/--/api/v2/push/send` com um array `[{ to, title, body, data }]` (fetch puro; batch). Lê os tickets/erros; em `DeviceNotRegistered` (ou `InvalidCredentials` por token) → apaga aquele `PatientPushToken`. Nunca lança pro dispatch (um token ruim não derruba os outros).

## Mobile

- **Dependência nova: `expo-notifications`** + entrada no `plugins` do `app.config.js`. (`expo-device` opcional p/ checar device físico — incluir só se necessário ao fluxo.)
- `lib/push.ts` (+ `lib/queries/push.ts`): `registerForPush()` — pede permissão (`Notifications.requestPermissionsAsync`), obtém `Notifications.getExpoPushTokenAsync({ projectId })` (projectId de `expo-constants`/app.config), e `PUT /me/push-tokens`. `unregisterPush(token)` → `DELETE /me/push-tokens/:token`.
- **Configurações** (`app/(app)/configuracoes/index.tsx`): novo item **"Lembretes de consulta"** (toggle). Ligar → `registerForPush()` (se a permissão for negada, mostra aviso e mantém desligado). Desligar → `unregisterPush()`. Estado on/off persistido localmente (`expo-secure-store`) e/ou derivado do sucesso do registro. Sem auto-registro no login (opt-in deliberado).
- Handler de notificação padrão (foreground) via `Notifications.setNotificationHandler` no bootstrap do app.

## Disparo — Render Cron

Novo serviço no `render.yaml`:
```yaml
  - type: cron
    name: nutri-plus-reminders
    runtime: docker
    schedule: "*/30 * * * *"        # a cada 30 min
    dockerfilePath: apps/api/Dockerfile
    dockerContext: .
    dockerCommand: >
      bun -e "const r = await fetch(process.env.REMINDER_DISPATCH_URL, { method: 'POST', headers: { 'x-reminder-key': process.env.REMINDER_DISPATCH_KEY } }); process.exit(r.ok ? 0 : 1)"
    envVars:
      - key: REMINDER_DISPATCH_URL     # https://<api-host>/v1/internal/reminders/dispatch
        sync: false
      - key: REMINDER_DISPATCH_KEY
        sync: false
```
E `REMINDER_DISPATCH_KEY` adicionado ao serviço `web` (mesmo segredo, `sync:false`) + ao `env.schema` (`z.string().min(1)`; sem default — é segredo). *(Comando exato do cron ajustável ao que o Render aceita; a intenção é: chamar o endpoint protegido periodicamente.)*

## Testes

- **API (jest):**
  - dispatch: só consultas na janela (24h, futuras, `patientId` setado, não-lembradas); pula sem token **sem marcar**; envia-então-marca; múltiplos tokens; `DeviceNotRegistered` → apaga o token; resumo sem PII.
  - me/push-tokens: upsert por token; delete scoped ao paciente; `@Roles(PATIENT)` + escopo.
  - guarda do endpoint interno: sem/errada `x-reminder-key` → 401.
  - `ExpoPushService`: mock `fetch`; monta o payload certo; trata tickets de erro.
- **Mobile (jest + @testing-library/react-native):** toggle de Configurações (permissão concedida → chama register + `PUT`; desligar → `DELETE`); permissão negada → fica desligado; `lib/push` mockando `expo-notifications` + `apiFetch`.
- **shared-types:** build limpo.

## Restrições

- Migração **aditiva** (`PatientPushToken` + `Appointment.appointmentReminderSentAt` + back-relation). shared-types reconstruído. pt-BR.
- **Nova dependência só no mobile: `expo-notifications`** (aprovado). Servidor: **sem** dep nova (fetch puro pro Expo). `@nestjs/schedule` **não** é adicionado (Render Cron faz o disparo).
- **Paciente-scoped** pro que o paciente controla (`@Roles(PATIENT)` + `resolveScopePatientId`); endpoint interno protegido por segredo (`x-reminder-key`), nunca exposto ao cliente. Nutricionista/web inalterados no E1.
- **Opt-in**: token só existe enquanto o paciente optou; apagado no opt-out/logout e em `DeviceNotRegistered`.
- Reusar: `me/*` controllers + `resolveScopePatientId`, vertical slice, Prisma, `lib/api`+`lib/queries` (mobile), tela Configurações, o padrão de rota-pública-com-segredo do webhook.
- Aspas: api simples; web/mobile por arquivo. Testes API JEST / mobile JEST / web vitest. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** push/PR sem pedir. Branch `feat/lembretes-push`. Verificar por área: shared-types build; API test+tsc; mobile test+tsc; web tsc (não deve rippar).

## Mapa de arquivos

- `apps/api/prisma/schema.prisma` (+ `PatientPushToken` + `Appointment.appointmentReminderSentAt` + `PatientProfile.pushTokens`) + migração
- `packages/shared-types/src/v1/push.ts` (novo) + `v1/index.ts`
- `apps/api/src/notifications/**` — módulo (push-tokens controller `me/push-tokens` + service/repo; reminders dispatch controller `internal/reminders/dispatch` + service; `ExpoPushService`) + registro no `app.module` + `env.schema` (`REMINDER_DISPATCH_KEY`) + specs
- `render.yaml` (+ serviço `type: cron` + env no `web`)
- `apps/mobile/package.json` (+ `expo-notifications`) + `app.config.js` (plugin) + `apps/mobile/lib/push.ts` + `lib/queries/push.ts` + `app/(app)/configuracoes/index.tsx` (toggle) (+ tests)
