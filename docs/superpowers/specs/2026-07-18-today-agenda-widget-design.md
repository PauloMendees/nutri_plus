# Today's-Agenda Floating Widget (web) — Design

**Date:** 2026-07-18
**Branch:** `feat/today-agenda-widget` (off main)
**Status:** Approved design — ready for implementation plan

**Sub-project F** of a 6-feature batch (order: F → B calculadoras → A TACO → C LGPD → D anamnese → E push). A floating, minimizable popup in the **bottom-left** of the nutritionist web app that shows **today's** appointments from the agenda.

## Scope

Web only (`apps/web`). Reuses the existing appointments API/query and agenda helpers — no API or shared-types change, no migration.

## Component

New client component `apps/web/src/components/agenda/today-agenda-widget.tsx`, mounted globally in `apps/web/src/app/(app)/layout.tsx` (inside `<SidebarInset>`, as a sibling of `<main>`) so it renders on every nutritionist dashboard page. The `(app)` layout already redirects non-dashboard roles, so no extra role gating is needed.

## Data

- `useAppointments({ from, to })` (`@/lib/queries/appointments`) with `from` = **today 00:00** and `to` = **today 23:59:59.999** in local time, serialized with `toISOString()`. Same date-range contract the agenda page uses (`startsAt` within `[from, to]`).
- Appointments sorted by `startsAt` ascending.
- `refetchInterval` ~5 minutes + refetch on window focus so the list stays current through the day.
- Reuse `formatTimeRange` (`@/lib/agenda/dates`) and `appointmentColor` (`@/lib/agenda/colors`).

## Layout & behavior

Fixed bottom-left: `fixed bottom-4 left-4 z-50`.

- **Expanded (default first-run):** a card (~`w-80`, `max-h` with internal scroll):
  - Header: "Agenda de hoje" + today's date + a **minimize** button (–).
  - List: each row = a colored dot (category color via `appointmentColor`, fallback primary), the time range (`formatTimeRange(startsAt, endsAt)`), and the title + patient name (`appointment.patient?.user.name`). Clicking a row opens the appointment for editing (see Interaction).
  - Footer: a **"+ Novo"** action (opens the dialog in create mode, `initialDate` = today) and a **"Ver agenda completa"** link to `/agenda`.
  - Empty state: "Sem agendamentos hoje." + the "+ Novo" action.
- **Minimized:** a small pill/button (calendar icon + "Hoje · N", N = today's count) that re-expands on click.

## Interaction (edit dialog)

Reuse `AppointmentDialog` (`@/components/agenda/appointment-dialog`), whose props are `{ open, onOpenChange, initialDate?, appointment? }` and which fetches its own categories (`useAppointmentCategories`) and owns the create/update/delete mutations (they invalidate `['appointments']`, so the widget and the agenda page refresh together).

Widget state:
- `editing: Appointment | null` — clicking a row sets it; renders `<AppointmentDialog open appointment={editing} onOpenChange={(o) => !o && setEditing(null)} />`.
- `creating: boolean` — the "+ Novo" action; renders `<AppointmentDialog open initialDate={today} onOpenChange={(o) => !o && setCreating(false)} />`.

## Confirmed UX defaults

- **Expanded by default** on first load; minimized/expanded preference persisted in `localStorage` (remembers across sessions; first run = expanded).
- **Hidden on small screens** (`hidden md:block`) — desktop-first dashboard; avoids covering mobile navigation.
- **Hidden on the `/agenda` route** (via `usePathname()`) — redundant there.

## Testing (vitest)

`today-agenda-widget.test.tsx`:
- Renders today's appointments (mock `useAppointments`) sorted by time, and the count in the minimized pill.
- Minimize/expand toggles the card vs. pill.
- Clicking a row opens the dialog (assert the `AppointmentDialog` renders with the clicked appointment — mock it or assert `open`/`appointment`).
- Empty state ("Sem agendamentos hoje.").
- Returns null on `/agenda` (mock `usePathname` → `/agenda`).
- Mock `localStorage` for the persistence path.

## Constraints

- NO new dependencies. pt-BR copy. Web tests = **vitest**. Match the `agenda/` folder quote style (**double quotes**). No API/shared-types/DB change.
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push/PR. Branch `feat/today-agenda-widget`.

## File map

- Create: `apps/web/src/components/agenda/today-agenda-widget.tsx`
- Create: `apps/web/src/components/agenda/today-agenda-widget.test.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx` (mount the widget)
- (Optional) a tiny `startOfToday`/`endOfToday` helper, inline or in `@/lib/agenda/dates`.
