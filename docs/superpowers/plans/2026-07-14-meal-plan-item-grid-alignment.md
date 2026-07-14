# Meal-Plan Item Grid Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the meal-plan editor's food-item grid by widening the QTD column and top-aligning the item-row cells.

**Architecture:** Two CSS-class-only edits to one `<tr>` in the `OptionCard` item table — no behavior change, no new component.

**Tech Stack:** Next.js + Tailwind, react-hook-form (unchanged).

## Global Constraints

- Same branch `feat/plan-photo-ai-adjust-evolution-pdf` (adds to open PR #39).
- NO new dependencies. pt-BR copy unchanged.
- Match the file's quote style (single-quote JS/imports, double-quote JSX attrs; the `w-40`/`w-20` live inside template-literal `className` expressions).
- Do NOT push/PR unless asked.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Verify: `pnpm --filter @nutri-plus/web test` + `pnpm --filter @nutri-plus/web exec tsc --noEmit`.

---

### Task 1: Widen QTD column + top-align the item-row cells

**Files:**
- Modify: `apps/web/src/components/patients/meal-plan-editor.tsx` (the `OptionCard` item `<table>` body row)

**Interfaces:** none (class-only).

This is a CSS-class-only change with no behavioral effect, so there is no meaningful new unit test to write (no query depends on column width or vertical alignment) — the gate is the existing editor suite + `tsc` staying green, mirroring round-2 Task T2 (also class-only).

- [ ] **Step 1: Apply the two edits to the item-row `<tr>`**

In `meal-plan-editor.tsx`, inside `OptionCard`'s `items.fields.map(...)`, the current row is:

```tsx
              <tr key={itemField.id}>
                <td className="py-1 pr-1"><Textarea rows={1} className={GROW_SM} aria-label="Alimento" {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.foodName`)} /></td>
                <td className="py-1 pr-1"><Textarea rows={1} className={`w-20 ${GROW_SM}`} aria-label="Quantidade" {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.quantity`)} /></td>
                {ITEM_MACROS.map((m) => (
                  <td key={m.key} className="py-1 pr-1">
                    <Input className="h-7 w-16" type="number" inputMode="decimal" step="any" aria-label={m.label}
                      {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.${m.key}` as const)} />
                  </td>
                ))}
                {canEdit && (
                  <td className="py-1">
                    <span className="flex gap-1">
                      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => items.swap(itemIndex, itemIndex - 1)} disabled={itemIndex === 0} aria-label="Mover item para cima">↑</Button>
                      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => items.swap(itemIndex, itemIndex + 1)} disabled={itemIndex === items.fields.length - 1} aria-label="Mover item para baixo">↓</Button>
                      <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive" onClick={() => items.remove(itemIndex)} aria-label="Remover item">✕</Button>
                    </span>
                  </td>
                )}
              </tr>
```

Replace it with (only the `<td>` classNames and the quantity width change; everything else byte-identical):

```tsx
              <tr key={itemField.id}>
                <td className="py-1 pr-1 align-top"><Textarea rows={1} className={GROW_SM} aria-label="Alimento" {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.foodName`)} /></td>
                <td className="py-1 pr-1 align-top"><Textarea rows={1} className={`w-40 ${GROW_SM}`} aria-label="Quantidade" {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.quantity`)} /></td>
                {ITEM_MACROS.map((m) => (
                  <td key={m.key} className="py-1 pr-1 align-top">
                    <Input className="h-7 w-16" type="number" inputMode="decimal" step="any" aria-label={m.label}
                      {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.${m.key}` as const)} />
                  </td>
                ))}
                {canEdit && (
                  <td className="py-1 align-top">
                    <span className="flex gap-1">
                      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => items.swap(itemIndex, itemIndex - 1)} disabled={itemIndex === 0} aria-label="Mover item para cima">↑</Button>
                      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => items.swap(itemIndex, itemIndex + 1)} disabled={itemIndex === items.fields.length - 1} aria-label="Mover item para baixo">↓</Button>
                      <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive" onClick={() => items.remove(itemIndex)} aria-label="Remover item">✕</Button>
                    </span>
                  </td>
                )}
              </tr>
```

Net changes: (a) quantity `Textarea` `` `w-20 ${GROW_SM}` `` → `` `w-40 ${GROW_SM}` ``; (b) `align-top` appended to all four `<td>` className strings (`py-1 pr-1` → `py-1 pr-1 align-top`, and the actions `py-1` → `py-1 align-top`). Do NOT touch `GROW_SM`/`GROW`, the foodName `Textarea`, the numeric `Input`s, the `<thead>`, or any header field.

- [ ] **Step 2: Run the editor suite + typecheck — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/meal-plan-editor.test.tsx"` then `cd apps/web && pnpm exec tsc --noEmit`
Expected: all editor tests pass; tsc clean (class-only change, no query depends on width/alignment).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/patients/meal-plan-editor.tsx
git commit -m "fix(web): align meal-plan item grid (wider QTD column + top-aligned cells)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

```bash
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/web exec tsc --noEmit
```

Manual (optional): open a plan with a food item whose QTD is "2 colheres de sopa" — it fits on one line in the wider column, and the KCAL/P/C/G columns line up across rows.
