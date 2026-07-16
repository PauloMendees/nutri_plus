# Silhueta — Photo-based Body-Composition Estimate — Design

**Date:** 2026-07-16
**Branch:** `feat/silhueta` (off main; PR #40 already merged)
**Status:** Approved design (pending spec review) — feature #3, MVP

**Silhueta** estimates a patient's body composition from two photos + height/weight,
using the existing OpenAI vision model — framed honestly as a **non-diagnostic
estimate** meant only to track a single patient's trend over time (never
comparable to bioimpedance/DEXA). Nutritionist-driven, in the web portal, mirroring
WebDiet's "Body3D" flow.

## Grounding (from the feasibility research)

Photo→body-fat is *reliable for tracking one person* (ICC > 0.99) but *biased and
not interchangeable* with reference methods (±~5 pp individual error); a general
vision LLM is rougher than purpose-built CNNs. → The product must present results
as an estimate, compare **Silhueta-to-Silhueta only**, and carry clear disclaimers.
A purpose-built API (e.g. Prism) is a deferred future accuracy upgrade.

## Engine

- Extend `OpenAIProvider.generateStructured` to accept optional `images: string[]`
  (data URLs). When present, the user message becomes a multimodal content array
  (`{type:'text'}` + one `image_url` part per image). Backward-compatible.
- New prompt `ai/prompts/silhueta.prompt.ts` (pt-BR): "estime a composição corporal
  a partir das fotos frontal e lateral + altura/peso; é uma ESTIMATIVA, NÃO um
  método diagnóstico, sem alegações médicas; …". Output schema aligned to the
  BodyAssessment metrics so it can populate an assessment 1:1:
  `bodyFatPercentage`, `muscleMassPercentage`, `leanMassPercentage`,
  `waistCircumference`, `hipCircumference`, `chestCircumference`,
  `armCircumference`, `thighCircumference`, `abdomenCircumference`,
  `contractedArmCircumference`, `calfCircumference` (all numeric, may be null).
  `fatMass` (kg) is computed server-side = `weight * bodyFatPercentage / 100`
  (not requested from the AI). Waist-hip ratio computed server-side.
- New `AIInteractionType.SILHUETA_SCAN` (enum add, additive migration), logged via
  the existing `generateStructured` audit path with `patientId`.

## Data model (additive migration)

- **New `SilhuetaScan`** (its OWN track — results are not comparable to BIA/manual):
  `id`, `patientId` (+ relation), `scanDate DateTime @default(now())`,
  `heightCm Float?`, `weightKg Float?`, `waistInput Float?`, `hipInput Float?`
  (optional operator-provided circumferences fed to the estimate), the estimated
  outputs above (`Float?` each), `fatMass Float?`, `consentAcceptedAt DateTime`,
  `createdAt`. `@@index([patientId, scanDate])`. **No photo columns** (see Privacy).
  shared-types: `SilhuetaScan` + `CreateSilhuetaScanRequest`.
- **`BodyAssessment` gains `estimatedFromPhoto Boolean @default(false)`** — set true
  only when a row is created from a Silhueta scan via the "apply" button (below);
  surfaced as a flag in the history so photo-estimates are visually distinct from
  measured/BIA values. shared-types `BodyAssessment` + evolution types gain it.

## Privacy (heightened — full-body photos are sensitive)

- **Analyze-then-discard: the raw photos are NEVER persisted** by us. They are sent
  to OpenAI only to produce the estimate, then dropped; we store only the numeric
  results. No photo columns, no bucket, no signed URLs.
- **Consent is required and recorded** (`consentAcceptedAt`): the form has a consent
  checkbox whose text discloses that the images are **processed by an AI provider
  (OpenAI)** to generate the estimate and are not stored. The API rejects a scan
  without consent.
- Disclaimers surfaced on the form and the report (estimate, non-diagnostic, not
  comparable, Silhueta-to-Silhueta only).

## API (`apps/api/src/patients/` + a `silhueta` module)

- `POST /v1/patients/:id/silhueta` — multipart (`front`, `side` images via
  `FileInterceptor`/`ParseFilePipe` + `isSupportedImage`; reuse `image-upload.ts`)
  + body (heightCm, weightKg, optional waistInput/hipInput, consent flag). Ownership
  check (404). Converts images to data URLs, calls the multimodal estimate, computes
  `fatMass`/WHR, persists a `SilhuetaScan`, returns it. Requires consent.
- `GET /v1/patients/:id/silhueta` — the patient's Silhueta history (for the report's
  Silhueta-only evolution).
- `POST /v1/patients/:id/silhueta/:scanId/apply` — the **"Atualizar avaliação do
  paciente"** button: server-side creates a `BodyAssessment` from the scan
  (maps bodyFatPercentage/muscle%/lean%/circumferences + weight, `assessmentDate` =
  scan date, `estimatedFromPhoto: true`), returns it. The flag is server-set (never
  client-supplied).
- Roles: `@Roles(NUTRITIONIST)` (mutations), list may add EMPLOYEE like the other
  patient reads. Wire a new module or fold into patients module.

## Web (`apps/web`)

- A **Silhueta** section on the patient detail (tab or card): intro modal (what it
  is + disclaimer), then the form — date, height, weight, optional waist/hip, upload
  **front** + **side** photo, **consent checkbox** — → "enviar para análise".
- **Report view** (mirrors the WebDiet report): index bars (Abaixo/Normal/Acima) for
  the key metrics, a **Silhueta-only** evolution history (bf%, weight, etc. across
  prior scans), disclaimers, short educational text. After the report renders, an
  **"Atualizar avaliação do paciente"** button → calls `…/apply` → toast; the new
  (flagged) assessment then appears in the Bioimpedância tab.
- data-layer: `lib/api/silhueta.ts` + `lib/queries/silhueta.ts` (create/list/apply),
  mirroring the assessments pattern (`browserApiUpload` for the multipart create).

## Distinguishing photo-estimates in the assessment history

- **Web `bioimpedance-section.tsx`** and **mobile evolution `index.tsx`**: when
  `assessment.estimatedFromPhoto`, show a camera icon + tooltip "Estimado por foto
  (Silhueta)" — reusing the round-1 `loggedByPatient` icon/tooltip pattern — so a
  photo-estimate is never mistaken for a measured value.

## Deferred (not MVP)

Literal 3D body render; guided-capture example video; patient-side mobile capture;
PDF export of the Silhueta report; the purpose-built third-party API upgrade.

## Testing

- API: `OpenAIProvider` image-passing unit (multimodal message shape); Silhueta
  service (builds estimate from images+inputs via mocked provider, computes fatMass,
  persists, requires consent, 404 own-scope); apply endpoint (creates a
  `BodyAssessment` with `estimatedFromPhoto: true`).
- shared-types build.
- web: Silhueta form (consent gate, submit → mutation), report render (bars +
  history + disclaimers), apply button → mutation; bioimpedance shows the
  photo-estimate flag.
- mobile: evolution shows the photo-estimate flag (tsc + test).

## Constraints

- NO new dependencies (OpenAI multimodal via the existing SDK; reuse image-upload,
  pdf infra later). pt-BR. Additive migrations on the shared dev DB. shared-types
  rebuilt. AI output no medical claims. Match file quote styles. Commit trailer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do not push/PR unless asked.
- Photos never persisted; consent required + recorded; disclaimers everywhere.

## Files (high level)

- API: `ai/openai.provider.ts` (+images), `ai/types/ai.types.ts`, `ai/prompts/silhueta.prompt.ts` (new), `prisma/schema.prisma` (+`SilhuetaScan`, +`AIInteractionType.SILHUETA_SCAN`, +`BodyAssessment.estimatedFromPhoto`) + migration, a `silhueta` service/controller (new), `patients` (apply endpoint) + specs.
- shared-types: `silhueta.ts` (new) + `assessment.ts` (`estimatedFromPhoto`).
- web: `lib/api/silhueta.ts`, `lib/queries/silhueta.ts`, a Silhueta section/dialog + report components, `bioimpedance-section.tsx` (flag).
- mobile: `app/(app)/index.tsx` (flag).
