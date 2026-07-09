# Bioimpedance Self-Log — Adjustments Design

**Date:** 2026-07-09
**Status:** Approved (design)
**Branch:** feat/patient-self-log-bioimpedance (extends the shipped self-log feature; PR #37 open)

## Goal

Three post-test adjustments to the patient self-log bioimpedance feature:
1. The mobile form route stopped showing as a bottom tab.
2. The "Registrar medição" button moved to the end of the Evolução screen.
3. The web nutritionist listing flags assessments the **patient** self-logged
   (icon + tooltip before the date).

## Decisions (from brainstorming, approved)

- **Source tracking:** a **boolean** `loggedByPatient` on `BodyAssessment`
  (default `false`) — YAGNI over an enum; answers directly "was it the patient?".
- **Web signal:** a lucide `Smartphone` icon before the date + a shadcn Tooltip
  "Registrado pelo paciente pelo app".

## 1. Mobile — hide the form route from the tab bar

`apps/mobile/app/(app)/_layout.tsx`: expo-router auto-registers every route in
the `(app)/` segment as a tab, so `nova-medicao.tsx` appears as a 5th tab. Add:

```tsx
<Tabs.Screen name="nova-medicao" options={{ href: null }} />
```

`href: null` removes it from the tab bar while keeping the route pushable via
`router.push('/nova-medicao')` (the "Registrar medição" button). No other tab
changes.

## 2. Mobile — move the button to the end of Evolução

`apps/mobile/app/(app)/index.tsx`: in the **main render**, move the gated
`{canLog ? <Button label="Registrar medição" .../> : null}` from the header
block to **after** the "Detalhes da última avaliação" grid (end of content).
Keep the **empty-state** button as-is (it's the only entry point for the first
measurement). Gate logic unchanged.

## 3. Track source + flag patient-logged rows on web

### Data model — `apps/api/prisma/schema.prisma` (additive migration)
Add to `model BodyAssessment`:
```prisma
  loggedByPatient Boolean @default(false)
```
Existing rows and nutritionist-created rows are `false`.

### API — `apps/api/src/patients/patients.service.ts`
- `createMyAssessment` (patient): create with `loggedByPatient: true`.
- `createAssessment` (nutritionist): unchanged → default `false`.
- `listAssessments` (nutritionist) and `listMyAssessments` return the scalar
  (already included by default; no select change).

### shared-types — `packages/shared-types/src/v1/assessment.ts`
Add `loggedByPatient: boolean;` to the `BodyAssessment` interface.

### Web — `apps/web/src/components/patients/bioimpedance-section.tsx`
In the table row, when `a.loggedByPatient` is true, render before the date a
lucide `Smartphone` icon wrapped in the shadcn Tooltip
(`TooltipProvider`/`Tooltip`/`TooltipTrigger`/`TooltipContent`, as used in
`meal-plans-section.tsx`) with content "Registrado pelo paciente pelo app".
Non-self-logged rows render the date unchanged. (The existing `<Tooltip />` in
this file is recharts' chart tooltip — unrelated; use the shadcn `ui/tooltip`.)

## Testing

- **API (jest):** `createMyAssessment` persists `loggedByPatient: true`;
  nutritionist `createAssessment` leaves it `false`.
- **Web (vitest + RTL):** a `loggedByPatient` row renders the icon/tooltip
  trigger (e.g. by accessible name/label); a normal row does not.
- **Mobile (jest):** the Evolução gate test stays green (button still present
  when `canLog`); the tab-bar change is layout config (not unit-tested).
- **shared-types:** builds clean.

## Global constraints

- SINGLE quotes in api/mobile files; match web's existing quote style in web files.
- pt-BR user copy ("Registrado pelo paciente pelo app").
- Additive migration on the shared dev DB (`prisma migrate dev`); never commit `.env`.
- Reuse existing primitives (shadcn Tooltip on web; no new mobile primitives).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. No push/PR unless asked.
- Verify per layer: api test · web test + tsc · shared-types build · mobile tsc + test.
