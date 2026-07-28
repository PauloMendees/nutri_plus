# Publicação do app nas lojas (iOS + Android) — EAS

Passo a passo pra buildar e enviar o app do paciente (`apps/mobile`) pra App Store e Google Play. Rodar tudo de dentro de `apps/mobile/`.

> **Push notifications:** desde que o app passou a usar `expo-notifications` (lembretes de consulta), publicar exige um **novo build nativo** (não é update OTA) e, no Android, **FCM configurado** — senão o push registra mas não é entregue (falha silenciosa).

## 0. Pré-requisitos (uma vez)
- `npm i -g eas-cli` (ou usar via `npx eas-cli`) + `eas login` (owner `paulo-mendes-tecnologia`).
- **Versão de marketing:** bumpar `version` em `app.config.js` a cada release visível ao usuário (o `autoIncrement` do perfil `production` só cuida do *build number*, não do `version`).
- **Android — FCM (crítico):** `eas credentials` → Android → subir a **FCM V1** service account key (projeto no Firebase → app `com.inutri.app`). Sem isso o Android não recebe push.
- **iOS — APNs:** `eas credentials` → iOS → gerar/confirmar a **Push Key** (o EAS gerencia; também gera Distribution Certificate + Provisioning Profile no 1º build de produção).
- **Credenciais de submit** (opcional, p/ envio não-interativo) — ver `eas.json` (`submit.production`): `serviceAccountKeyPath` (Google Play) e `ascApiKeyPath`/`ascApiKeyId`/`ascApiKeyIssuerId` (App Store Connect). Os arquivos ficam **fora do git**.

## 1. Build (produção)
```bash
cd apps/mobile
eas build --platform all --profile production        # Android .aab + iOS .ipa
# ou separado:
eas build --platform android --profile production    # .aab (app-bundle) pro Play
eas build --platform ios --profile production         # .ipa pra App Store
```
O `eas-build-post-install` builda o `@nutri-plus/shared-types` no servidor EAS.

## 2. Submit (enviar às lojas)
```bash
eas submit --platform android --profile production    # → Google Play (track: internal)
eas submit --platform ios --profile production         # → App Store Connect
```
Encadear build+submit: `eas build --platform all --profile production --auto-submit`.

## 3. Nos dashboards (fora do CLI)
- **App Store Connect:** "What's New", **App Privacy** (declarar push token / device id), submeter pra review.
- **Google Play Console:** promover o track **internal → produção**; revisar **Data safety**.

## 4. Antes de liberar geral
- Testar num **device físico** (push remoto não funciona no simulador iOS nem no Expo Go — precisa de dev/production build).
- **Backend:** confirmar no Render que `REMINDER_DISPATCH_URL` + `REMINDER_DISPATCH_KEY` estão setados, senão o cron de lembretes não dispara.

## Caminho feliz (FCM/APNs já configurados)
```bash
cd apps/mobile
# bump `version` no app.config.js
eas build --platform all --profile production --auto-submit
```
