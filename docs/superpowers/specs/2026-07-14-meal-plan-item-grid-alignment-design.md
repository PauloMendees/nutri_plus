# Meal-Plan Item Grid Alignment — Design

**Date:** 2026-07-14
**Branch:** `feat/plan-photo-ai-adjust-evolution-pdf` (extends open PR #39; round-3 polish)
**Status:** Approved design — ready for implementation plan

## Problem

In the meal-plan editor's food-item table (the `OptionCard` `<table>` in
`apps/web/src/components/patients/meal-plan-editor.tsx`), round-1 converted the
QTD (quantity) cell to an auto-grow `Textarea` (`w-20`, ~80px). Quantities like
`2 colheres de sopa` and `1 unidade média` wrap to 2–3 lines in that narrow
column, so rows become different heights and the numeric columns
(KCAL / P / C / G) no longer line up across rows — the grid reads as ragged.

Only this item table is affected. The standalone header fields (plan title,
objective, meal name, timeLabel, option label, instructions) are unrelated —
they don't sit in a grid, so their auto-grow stays as-is.

## Approach (chosen: widen QTD + top-align)

Two class-only edits, scoped to the `OptionCard` item `<table>`:

1. **Widen the QTD column.** The quantity `Textarea` className changes from
   `` `w-20 ${GROW_SM}` `` → `` `w-40 ${GROW_SM}` `` (~160px), enough for
   `2 colheres de sopa` / `1 unidade média` to fit on one line in the common
   case. (`w-40` is a tunable value; a longer quantity still wraps but stays
   aligned per #2.)

2. **Top-align the item-row cells.** Add `align-top` (CSS `vertical-align: top`)
   to every `<td>` in the item `<tr>` inside `<tbody>` — the food-name cell, the
   quantity cell, each of the four numeric-macro cells, and the actions cell.
   This makes the food-name text, QTD text, the fixed-height numeric `Input`s,
   and the reorder/remove buttons all begin at the same top line, so the columns
   align even when a cell wraps.

**Preserved:** the food-name `Textarea` stays flexible-width and auto-grows
(round-1 "don't hide long food names" intact); the numeric macros remain
`Input type="number"` (`h-7 w-16`); the standalone header fields are untouched.

## Testing

Both edits are CSS-class-only with no behavioral change. No test query depends
on column width or vertical alignment, so the gate is: the existing
`meal-plan-editor.test.tsx` suite and `tsc --noEmit` stay green
(`pnpm --filter @nutri-plus/web test` + `pnpm --filter @nutri-plus/web exec tsc --noEmit`).

## Constraints

- Same branch `feat/plan-photo-ai-adjust-evolution-pdf` (adds to PR #39).
- NO new dependencies. pt-BR copy (unchanged). Match the file's quote style
  (single-quote imports/JS, double-quote JSX attrs).
- Do NOT push/PR unless asked.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Files

- `apps/web/src/components/patients/meal-plan-editor.tsx` — QTD `w-20`→`w-40`; add `align-top` to the item-row `<td>`s.
