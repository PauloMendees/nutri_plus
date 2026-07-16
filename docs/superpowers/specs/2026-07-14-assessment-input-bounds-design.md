# Assessment Input Bounds (max validation) — Design

**Date:** 2026-07-14
**Branch:** `feat/assessment-percent-circumferences` (extends open PR #40 — refines the validation that PR touches)
**Status:** Approved design — ready for implementation plan

## Problem

Body-assessment numeric inputs are validated as `≥ 0` only (weight & BMR strictly
`> 0`, metabolicAge an integer). None has an **upper bound**, so a percentage
field can accept values above 100 and a typo (extra digit) in any field is
accepted silently. Nutritionist feedback: a `%` input must not exceed 100 — and,
per the user, a general sanity pass on the other fields' maximums.

Validation lives in **three** places that must stay in agreement:
- `apps/api/src/patients/dto/create-assessment.dto.ts` (class-validator)
- `apps/web/src/lib/validation/assessment.ts` (zod)
- `apps/mobile/lib/validation/assessment.ts` (zod)

## Bounds (min unchanged; add an inclusive max per field)

| Field(s) | Min (today) | New max |
|---|---|---|
| `bodyFatPercentage`, `bodyWaterPercentage`, `muscleMassPercentage`, `leanMassPercentage` | ≥ 0 | **100** |
| `weight` (kg) | > 0 | 500 |
| `waistCircumference`, `abdomenCircumference`, `hipCircumference`, `thighCircumference`, `armCircumference`, `contractedArmCircumference`, `chestCircumference`, `calfCircumference` (cm) | ≥ 0 | 300 |
| `basalMetabolicRate` (kcal) | > 0 | 10000 |
| `boneMass` (kg) | ≥ 0 | 20 |
| `metabolicAge` (int) | ≥ 0 | 120 |
| `visceralFat` | ≥ 0 | 60 |

All maxes are **inclusive** (100%, 500 kg, etc. are valid). `weight`/`basalMetabolicRate`
keep their strictly-positive lower bound; `metabolicAge` stays integer.
`notes` (max 2000 chars) and `assessmentDate` (not future) are unchanged.

## Approach

- **API DTO:** add `@Max(N)` to each numeric field (import `Max` from
  `class-validator`) per the bounds table. `weight`/`basalMetabolicRate` keep
  `@IsPositive` + gain `@Max`; `metabolicAge` keeps `@IsInt @Min(0)` + gains
  `@Max(120)`. All fields stay optional. The legacy kg fields `muscleMass`/
  `leanMass` also get a max — see the "Legacy kg fields note" below.
- **web + mobile zod:** the two files are structurally identical. Replace the
  flat helpers with small bounded factories so every field declares its ceiling:
  ```ts
  const optBounded = (max: number) => z.preprocess(emptyToUndefined,
    z.coerce.number().min(0, 'Não pode ser negativo.').max(max, 'Valor acima do limite.').optional());
  const optPositiveBounded = (max: number) => z.preprocess(emptyToUndefined,
    z.coerce.number().positive('Deve ser maior que zero.').max(max, 'Valor acima do limite.').optional());
  const optIntBounded = (max: number) => z.preprocess(emptyToUndefined,
    z.coerce.number().int('Deve ser um número inteiro.').min(0, 'Não pode ser negativo.').max(max, 'Valor acima do limite.').optional());
  const percent = optBounded(100); // with message 'Não pode passar de 100.'
  ```
  Then wire each field to its bound: `weight: optPositiveBounded(500)`, the four %
  fields: `percent`, circumferences: `optBounded(300)`, `basalMetabolicRate:
  optPositiveBounded(10000)`, `boneMass: optBounded(20)`, `metabolicAge:
  optIntBounded(120)`, `visceralFat: optBounded(60)`. Keep the `.refine('Informe
  ao menos uma métrica')`. Use a percent-specific message ("Não pode passar de
  100.") for the four % fields.

**Legacy kg fields note:** `muscleMass`/`leanMass` remain accepted by the API DTO
only (backward compat for the live iOS app; not in the web/mobile forms). Give
them `@Max(500)` (kg, weight-like) so the live app's payload still validates while
gaining a sane ceiling. They are not in the zod schemas (the new forms don't
collect them), so no zod change for them.

## Testing

- **API:** a DTO validation unit test using class-validator `validate()` on a
  plain `CreateAssessmentDto` instance — assert `bodyFatPercentage: 150` produces
  a `max` violation, `bodyFatPercentage: 100` passes, and an over-max on another
  field (e.g. `weight: 9999`) fails while a valid one passes.
- **web + mobile:** `assessmentSchema.safeParse` tests — a `%` of 150 → not
  success (with the message), 100 → success; a circumference of 9999 → not
  success. Add/extend the validation test file in each app.
- Keep all suites green: API test; web test + `tsc`; mobile `tsc` + test.

## Constraints

- Same branch `feat/assessment-percent-circumferences` (adds to PR #40).
- NO new dependencies. pt-BR messages. Match each file's quote style.
- Do NOT push/PR unless asked. Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Files

- `apps/api/src/patients/dto/create-assessment.dto.ts` — `@Max` per field (+ its spec/test)
- `apps/web/src/lib/validation/assessment.ts` — bounded helpers + per-field maxes (+ test)
- `apps/mobile/lib/validation/assessment.ts` — same (+ test)
