# Publishing the iNutri mobile app

A step-by-step runbook to build and publish the Expo app to the **Apple App
Store** and **Google Play**. The build config itself (profiles, icons, env) is
already in place — see [`eas.json`](./eas.json), [`app.config.ts`](./app.config.ts),
and the design doc at
[`docs/superpowers/specs/2026-07-07-mobile-eas-build-design.md`](../../docs/superpowers/specs/2026-07-07-mobile-eas-build-design.md).

## App facts (already configured)

| | Value |
| --- | --- |
| App name | iNutri |
| iOS bundle identifier | `com.inutri.app` |
| Android package | `com.inutri.app` |
| Version (user-facing) | `1.0.0` (in `app.config.ts`; build numbers auto-increment on EAS) |
| Build tool | EAS Build (Expo), CNG (no committed native folders) |
| API base | `https://nutri-plus-mfzt.onrender.com` (Render) |
| Web | `https://inutri.life` (Vercel) |

---

## 0. Prerequisites (one time)

- **Expo account** (free) — <https://expo.dev>.
- **eas-cli** — `npm install -g eas-cli` (or prefix commands with `npx eas-cli@latest`).
- **Apple Developer Program** — $99/year (see §1).
- **Google Play Developer** — $25 one-time (see §5).
- **A privacy policy URL** — both stores require it. Host one (e.g.
  `https://inutri.life/privacy`) before submitting.

---

## 1. Create the Apple Developer account

### Choose the entity type first (can't be converted later)

- **Individual / Sole Proprietor** — fast (minutes–hours), no D-U-N-S. Public
  "Seller" name on the store = **your personal legal name**.
- **Organization** — public seller = **company name**; requires a **D-U-N-S
  number** + legal entity + authority to sign; approval takes days.

> To move Individual → Organization later you must enroll a new org account and
> **transfer the app** (supported; ratings carry over, but it's a chore).

### Steps

1. Ensure the Apple ID has **two-factor auth** on. Use a company email you'll
   keep (e.g. `paulo@empathmsp.com`) — it owns everything.
2. Enroll via the **Apple Developer** app on iPhone/iPad (smoothest ID
   verification) or the web: <https://developer.apple.com/programs/enroll>.
3. Pick the entity type. For **Organization**, enter legal name, D-U-N-S
   (look up at <https://developer.apple.com/enroll/duns-lookup>), website, and
   confirm your authority.
4. Verify identity, accept the agreement, pay **$99**.
5. Wait for approval.

### After approval — collect these

- **Team ID** — Account → Membership → *Team ID* (10 chars).
- **App ID** — register `com.inutri.app` under *Certificates, Identifiers &
  Profiles → Identifiers* (or let `eas build` create it automatically).
- **App Store Connect app** — <https://appstoreconnect.apple.com> → My Apps →
  **+** → New App, bundle ID `com.inutri.app`. This yields the **App Store
  Connect app ID** (`ascAppId`, a numeric string in the app's URL/App
  Information).
- Your **Apple ID email** → used as `appleId`.

---

## 2. Link the EAS project (one time)

```bash
cd apps/mobile
eas login
eas init            # creates the EAS project on your account; prints a projectId
```

Paste the printed `projectId` into `app.config.ts` → `extra.eas.projectId`
(or set the `EAS_PROJECT_ID` env var). Commit that change.

---

## 3. Set the environment variables (one time, per environment)

The app reads three **client-safe** `EXPO_PUBLIC_*` values, injected at build
time from EAS environment variables. Set them for `production` (and `preview`):

```bash
cd apps/mobile
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL      --value 'https://<your>.supabase.co' --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value '<supabase anon key>'        --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_API_URL           --value 'https://nutri-plus-mfzt.onrender.com' --visibility plaintext
```

(Repeat with `--environment preview` if you build preview versions. These are
public values — the anon key is meant for clients — so `plaintext` is fine.)

---

## 4. Build

```bash
cd apps/mobile

# Sideloadable Android APK for quick internal testing:
eas build --profile preview --platform android

# Store builds (Android .aab + iOS store build), build numbers auto-increment:
eas build --profile production --platform all
```

On the **first iOS build**, EAS offers to generate and store the distribution
certificate and provisioning profile (EAS-managed credentials) — accept. Same
for the Android keystore. Nothing is committed to the repo.

---

## 5. Create the Google Play account + submit config

1. **Google Play Console** — $25 one-time: <https://play.google.com/console>.
   Create the app under package `com.inutri.app`.
2. Create a **service account** key (JSON) for automated submission:
   Play Console → *Setup → API access* → create/link a Google Cloud service
   account → grant it release permissions → download the JSON key. Keep it out
   of git (store the path and reference it via
   `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` or `eas.json` `submit.production.android.serviceAccountKeyPath`).

---

## 6. Submit to the stores

```bash
cd apps/mobile

# iOS → App Store Connect (prompts for Apple ID / the app if not in eas.json):
eas submit --profile production --platform ios

# Android → Play (uses the service account key; track "internal" per eas.json):
eas submit --profile production --platform android
```

Optionally add these to `eas.json` `submit.production` to skip prompts:

```jsonc
"ios": {
  "appleId": "<your Apple ID email>",
  "ascAppId": "<App Store Connect app ID>",
  "appleTeamId": "<Team ID>"
},
"android": {
  "serviceAccountKeyPath": "../../secrets/play-service-account.json",
  "track": "internal"
}
```

---

## 7. Finish the store listings (in the web consoles)

Both stores need listing content before the build can go live:

**App Store Connect**
- App name, subtitle, description, keywords, support URL, **privacy policy URL**.
- **Screenshots**: at least one 6.7"/6.9" iPhone set. ⚠️ `app.config.ts` has
  `ios.supportsTablet: true`, so **iPad screenshots are also required**. If you
  don't want to support iPad at launch, set `supportsTablet: false` to skip them.
- **App Privacy** questionnaire (what data you collect — you handle health/personal data).
- **Sign-in required** → provide a **demo account** (a test nutritionist +
  patient login) in App Review notes, or review will reject.
- Submit for review (first review typically 1–3 days).

**Google Play**
- Store listing (title, short/full description), **feature graphic**, phone
  screenshots, app icon.
- **Content rating** questionnaire, **Data safety** form, **privacy policy URL**.
- Target audience, and a demo account in the review notes.
- Roll out to the **internal** track first, then promote to production.

---

## 8. Shipping updates later

1. Bump `version` in `app.config.ts` when the user-facing version changes
   (e.g. `1.0.1`). Build numbers auto-increment remotely — no manual bump.
2. `eas build --profile production --platform all`
3. `eas submit --profile production --platform <ios|android>`

(For JS-only fixes you could later add **EAS Update** for OTA updates — not set
up yet; would require `expo-updates` + a `runtimeVersion` policy.)

---

## Quick reference

| Need | Where |
| --- | --- |
| `appleTeamId` | Apple Developer → Membership |
| `ascAppId` | App Store Connect → your app → App Information |
| `appleId` | your Apple ID email |
| Android service account key | Play Console → Setup → API access |
| EAS project id | `eas init` output → `app.config.ts` `extra.eas.projectId` |
| Env values | `eas env:list --environment production` |

### Common commands

```bash
eas whoami
eas build:list
eas build --profile production --platform all
eas submit --profile production --platform ios
eas env:list --environment production
```
