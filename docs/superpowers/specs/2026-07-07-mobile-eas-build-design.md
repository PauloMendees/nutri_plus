# Mobile (EAS) Build Setup — Design / Runbook

**Date:** 2026-07-07
**Status:** Approved (design)

## Goal

Make the Expo mobile app (`apps/mobile`, "iNutri") buildable into store-ready
Android and iOS packages via EAS Build, and configure EAS Submit for both
stores.

## Decisions (from brainstorming)

- **App identifier:** `com.inutri.app` (iOS `bundleIdentifier` + Android
  `package`, same value). Permanent once published.
- **Target:** store-ready — build **and** submit config for both stores.
- **Credentials:** EAS-managed (EAS generates + stores the iOS distribution
  cert/provisioning profile and the Android keystore on first build).
- **Env:** the three `EXPO_PUBLIC_*` values (all client-safe) live as EAS
  environment variables, not committed.
- **Icon:** rendered from the brand vector `docs/brand/logos/icon.svg`.

## Context (verified)

- Monorepo pnpm@9 + Turbo. `apps/mobile` = Expo SDK 54, expo-router
  (typedRoutes on), NativeWind v4, depends on `@nutri-plus/shared-types`
  (workspace; `dist` is **gitignored** → must be built during the EAS build).
- Native folders (`/ios`, `/android`) are gitignored → EAS uses CNG (prebuild at
  build time).
- `metro.config.js` already resolves the pnpm workspace (watchFolders +
  nodeModulesPaths + hierarchical lookup).
- App reads `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` (inlined at build).
- Current `app.config.ts` has name/slug/scheme/version but **no** app
  identifiers, icon, splash, or EAS project link. No `eas.json`, no `assets/`.
- App uses only expo-secure-store (keychain), expo-file-system (cache) +
  expo-sharing (share sheet) → **no** extra iOS/Android permission strings.

## What gets created / changed

### 1. `apps/mobile/app.config.ts`

- `version: '1.0.0'`.
- `ios: { supportsTablet: true, bundleIdentifier: 'com.inutri.app' }`.
- `android: { package: 'com.inutri.app', adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#14BFA6' } }`.
- `icon: './assets/icon.png'`.
- Convert the bare `'expo-splash-screen'` plugin to configured form:
  `['expo-splash-screen', { image: './assets/splash-icon.png', backgroundColor: '#FFFFFF', imageWidth: 200 }]`.
- Add `expo-dev-client` to `plugins` (for the development profile).
- `extra: { eas: { projectId: '<filled by eas init>' } }` and `owner` — set once
  after `eas init`.
- Build numbers are **not** hardcoded — managed remotely (see eas.json
  `appVersionSource: remote` + `autoIncrement`).

### 2. `apps/mobile/assets/` (rendered from `docs/brand/logos/icon.svg`)

- `icon.png` — 1024×1024, teal `#14BFA6` background + white mark (opaque).
- `adaptive-icon.png` — 1024×1024 Android foreground, white mark centered within
  the ~66% safe zone (transparent; background color set in app.config).
- `splash-icon.png` — teal mark on transparent, shown on white splash background.

### 3. `apps/mobile/eas.json`

```jsonc
{
  "cli": { "version": ">= 12.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "environment": "development"
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "environment": "preview"
    },
    "production": {
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" },
      "environment": "production"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "<your Apple ID email>",
        "ascAppId": "<App Store Connect app ID>",
        "appleTeamId": "<Apple Team ID>"
      },
      "android": {
        "serviceAccountKeyPath": "../path/to/play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

### 4. `apps/mobile/package.json`

- Add dependency `expo-dev-client` (for the development build profile).
- Add script `"eas-build-post-install": "pnpm --filter @nutri-plus/shared-types build"`
  so `@nutri-plus/shared-types` `dist` exists before the mobile bundle on EAS's
  servers.

### 5. `apps/mobile/.env.example`

Unchanged in shape (already lists the three vars); the runbook documents the
production values.

## Env values (set as EAS environment variables)

Set for the `production` and `preview` environments (and `development` → local):

| Var | Value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | prod Supabase URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | prod Supabase anon key (public) |
| `EXPO_PUBLIC_API_URL` | the Render API URL (e.g. `https://nutri-plus-api.onrender.com`) |

`eas env:create --environment production --name EXPO_PUBLIC_API_URL --value ... --visibility plaintext` (or via the EAS dashboard). All three are client-side/public values — no server secrets are ever placed here.

## Manual prerequisites (your accounts — outside this repo)

1. **Expo account** (free): `npx eas login`, then `npx eas init` (creates the EAS
   project, prints the `projectId` → paste into `app.config.ts` `extra.eas.projectId`).
2. **Apple Developer Program** ($99/yr): register the App ID `com.inutri.app`,
   create the app in App Store Connect (gives `ascAppId`); note your `appleTeamId`.
3. **Google Play Console** ($25 once): create the app under `com.inutri.app`;
   create a service-account JSON key for `eas submit` (Android).
4. Set the EAS environment variables (table above).
5. First `eas build`: approve EAS-managed credential generation (iOS cert +
   profile, Android keystore).

## Build & submit commands (after prerequisites)

```bash
# from apps/mobile (or repo root with --cwd)
npx eas build --profile preview   --platform android   # sideloadable APK
npx eas build --profile production --platform all       # .aab + iOS store build
npx eas submit --profile production --platform android
npx eas submit --profile production --platform ios
```

## Out of scope (v1)

- EAS Update (OTA) — can be added later (needs `expo-updates` + `runtimeVersion`).
- CI-triggered builds (GitHub Actions) — manual `eas build` for now.
- App store listing content (screenshots, descriptions).

## Verification

- `pnpm --filter @nutri-plus/mobile typecheck` clean.
- `pnpm --filter @nutri-plus/mobile test` stays green.
- `npx expo config --type public` (in `apps/mobile`) resolves with the new
  identifiers, icon, and splash.
- Assets are valid PNGs at the expected dimensions.

## Global constraints

- SINGLE quotes in new TS files; pt-BR user-facing copy (none added here).
- Never commit `.env`, `.expo/`, credentials, keystores, or the Play
  service-account key.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do not push/PR unless asked.
