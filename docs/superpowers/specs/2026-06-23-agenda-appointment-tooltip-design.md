# Agenda — appointment hover details (tooltip) — Design

**Date:** 2026-06-23
**Status:** Approved (pending implementation plan)
**Scope:** On hover (or keyboard focus) over an appointment — calendar chip, list row, or day-panel row — show all of the appointment's details in a tooltip.
**Builds on:** the agenda UI (`feat/agenda-ui`, PR #16, not yet merged). Lands on that branch and rides along in PR #16 (the agenda components it wraps don't exist on `main` yet). Same stack; reuses the existing shadcn `tooltip` (radix) and the agenda date helpers.

---

## 1. Goal

A nutritionist can hover any appointment anywhere it appears and immediately see its full details, without opening the edit dialog. Done when: hovering (or focusing) a calendar chip, a list row, or a day-panel row shows a tooltip with the appointment's title, day + time range, patient (if linked), and description (if present); all surfaces use the same tooltip.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Surfaces | **Everywhere an appointment appears** — calendar chips, list rows, day-panel rows — via one shared component. |
| Mechanism | shadcn `tooltip` (radix); hover **and** focus (keyboard a11y bonus). |
| Provider | One `TooltipProvider` mounted globally in `Providers` (`delayDuration: 200`). |
| Contents | Título (bold) · day + time range (`formatDayHeading` + `formatTimeRange`) · paciente (if linked) · descrição (if present). pt-BR. |
| New date logic | None — reuse `formatDayHeading`, `formatTimeRange` from `lib/agenda/dates`. |

## 3. Components

- **`apps/web/src/app/providers.tsx` (modify):** wrap the tree in `<TooltipProvider delayDuration={200}>` (inside `QueryClientProvider`). One global provider so tooltips work app-wide, including inside the day-panel's dialog portal (radix preserves context across portals).
- **`apps/web/src/components/agenda/appointment-tooltip.tsx` (create):** `AppointmentTooltip({ appointment, children })` — renders
  ```
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent>…details…</TooltipContent>
  </Tooltip>
  ```
  `asChild` merges the trigger onto the existing chip/row element (no extra DOM; click + keyboard preserved). Content: title (font-semibold), a line with `formatDayHeading(new Date(appointment.startsAt))` + `formatTimeRange(appointment.startsAt, appointment.endsAt)`, the patient name when `appointment.patient` is set, and the description when `appointment.description` is set.

## 4. Apply sites (wrap the existing trigger element)

- **`calendar-month.tsx`:** wrap the chip `<span role="button">` in `<AppointmentTooltip appointment={a}>…</AppointmentTooltip>`.
- **`agenda-list.tsx`:** wrap the row `<button>`.
- **`day-panel.tsx`:** wrap the row `<button>`.

In each case the wrapped element keeps its existing `onClick`/styling; `AppointmentTooltip` only adds the hover/focus tooltip.

## 5. Testing (Vitest + Testing Library)

- **`appointment-tooltip.test.tsx`:** render an `AppointmentTooltip` (inside a `TooltipProvider`) wrapping a trigger; hovering/focusing the trigger shows the title, the day + time range, the patient name, and the description; with no patient/description, those lines are absent. Note: radix-tooltip-in-jsdom is finicky — use `userEvent.hover(trigger)` then `await screen.findByText(...)`; the pointer-capture/ResizeObserver stubs already in `vitest.setup.ts` (from the dialog work) cover radix's needs. If hover proves unreliable in jsdom, focus the trigger (`trigger.focus()` / `userEvent.tab()`) — radix opens the tooltip on focus too.
- The existing calendar/list/day-panel tests must keep passing (wrapping with a trigger that has `asChild` should not change their queried roles/text).

## 6. Out of scope (YAGNI)

Click-to-open popovers; rich content (avatars, status, links to the patient); tooltips on anything other than appointments; configurable delay/placement. The deferred calendar a11y items (nested `role="button"` chips, day-number-only cell `aria-label`) remain a separate future pass — this slice only adds the on-focus tooltip as an incidental a11y improvement.
