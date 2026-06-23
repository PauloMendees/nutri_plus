# Agenda Page — calendar + list — Design

**Date:** 2026-06-23
**Status:** Approved (pending implementation plan)
**Scope:** The agenda module UI: a **month calendar** view and a **list** view over the existing `/v1/appointments` API, with full create / edit / delete of appointments via a dialog. Replaces the current `/agenda` stub.
**Builds on:** the patients-UI patterns (React Query client-side, `browserApiFetch`, `@nutri-plus/shared-types`, shadcn `Form`, react-hook-form + zod, the app shell). Same stack. New branch off `main`.

---

## 1. Goal

A nutritionist (or employee) can see their appointments in a big month calendar, toggle to a chronological list, and create/edit/delete appointments through a dialog. Clicking a day creates an appointment pre-dated to that day; clicking an event edits it; a busy day's overflow opens a day panel listing everything.

Done when: `/agenda` shows a **Mês** calendar and a **Lista** view (toggle); month navigation (`‹ / ›`, "Hoje") drives both; clicking an empty day opens the create dialog pre-filled with that date; clicking an event opens the edit dialog (with delete); a day with more events than fit shows `+N mais` → a day panel; create/edit/delete persist via the API and refresh both views; all states (loading / empty / error) are handled; copy is pt-BR.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Views | **Month calendar + List** (toggle). Week/day views deferred (YAGNI). |
| CRUD scope | **Full create + edit + delete** this slice (the API supports it). |
| Calendar rendering | **Custom month grid** (Tailwind), no calendar library. Only new shadcn primitive: `dialog`. |
| Day overflow | Cell capped at **3 event chips + `+N mais`**; `+N mais` (or the day number) opens a **day panel** listing all of that day's appointments. No expandable cells. |
| Create entry points | Click empty day-cell space/number (date pre-filled) · header **Novo agendamento** (date = today) · **Novo neste dia** inside the day panel. |
| List scope | **Selected month**, grouped by day. Same `‹ month ›` navigation drives both views (toggle changes *how* the same month is shown). |
| Dialog fields | Título (req), Paciente (optional, from patients list), Data, Início, Fim, Descrição (optional). |
| Dates/times | Native `<input type="date">` + `<input type="time">` (consistent with the patients form). No date library; small local date helpers + `Intl`. |
| Data layer | React Query; token from the browser Supabase session (`browserApiFetch`). |
| Testing | Vitest + Testing Library, mirroring existing web tests. |

## 3. API contract (existing `/v1/appointments`, roles NUTRITIONIST + EMPLOYEE)

- `GET /v1/appointments?from=&to=` — returns `Appointment[]` (asc by `startsAt`) overlapping `[from, to)` (`startsAt < to AND endsAt > from`); both query params optional, ISO datetime.
- `POST /v1/appointments` — body `CreateAppointmentRequest`; returns the created `Appointment`.
- `GET /v1/appointments/:id` — `Appointment`; `404` if not owned.
- `PATCH /v1/appointments/:id` — body `UpdateAppointmentRequest` (partial); returns the updated `Appointment`; `404` if not owned.
- `DELETE /v1/appointments/:id` — `204`; `404` if not owned.

**Appointment shape (response):**
```
id: string
nutritionistId: string
patientId: string | null
title: string
description: string | null
startsAt: string (ISO)
endsAt: string (ISO)
createdAt: string (ISO)
updatedAt: string (ISO)
patient: { id: string; user: { id: string; name: string; email: string } } | null
```

**Request fields:** `title` (req, ≤200), `startsAt`/`endsAt` (req on create; ISO), `description?` (≤2000; `null` on PATCH clears it), `patientId?` (the **patient-profile id**, same id `GET /v1/patients` returns; `null` on PATCH unlinks).

**Server validations the UI must surface (pt-BR):**
- **`409`** — appointment overlaps an existing one on the nutritionist's calendar → "Já existe um agendamento nesse horário."
- **`400`** "endsAt must be after startsAt" — guarded client-side too (fim > início).
- **`400`** "Invalid patient" (patient not owned) → generic "Não foi possível salvar o agendamento." fallback (shouldn't normally happen — options come from the user's own patients).

## 4. Routes & pages

- `/agenda` (under the `(app)` group, already auth-protected) — replace the `PagePlaceholder` stub with `<AgendaView />`.

No sub-routes: the view toggle, month navigation, dialog, and day panel are all client state within `/agenda` (a calendar app benefits from staying on one screen). Selected month and view live in component state (not the URL) this slice.

## 5. Data layer

- **`@nutri-plus/shared-types` (new `v1/appointment.ts`):** `AppointmentPatientSummary` (`{ id, user: { id, name, email } }`), `Appointment` (the response shape above, dates as ISO strings), `CreateAppointmentRequest` (`title`, `startsAt`, `endsAt`, `description?`, `patientId?`), `UpdateAppointmentRequest` (all optional; `description`/`patientId` nullable), `ListAppointmentsQuery` (`from?`, `to?` as ISO strings). Export from `v1/index.ts`. Web imports these.
- **`apps/web/src/lib/api/appointments.ts`:** `listAppointments({ from, to })`, `getAppointment(id)`, `createAppointment(body)`, `updateAppointment(id, body)`, `deleteAppointment(id)` — each gets the token via the existing `browserApiFetch` (which throws if no session) and hits `/v1/appointments…`. `from`/`to` serialized as ISO query params.
- **`apps/web/src/lib/queries/appointments.ts`:** React Query hooks — `useAppointments(range)` (key `['appointments', range.from, range.to]`), `useCreateAppointment()`, `useUpdateAppointment()`, `useDeleteAppointment()`. Mutations invalidate `['appointments']` on success.

## 6. Date helpers — `apps/web/src/lib/agenda/dates.ts`

Pure, unit-tested helpers (no date library):
- `monthGrid(year, month)` → a 6×7 array of `{ date: Date; inMonth: boolean; isToday: boolean }`, Sunday-first, covering the weeks that contain the month (leading/trailing days from adjacent months included).
- `gridRange(year, month)` → `{ from: Date; to: Date }` — midnight of the first grid cell to midnight after the last grid cell (the range fetched for that month so visible adjacent-month days show their events).
- `combineDateTime(dateStr, timeStr)` → `Date` (local) from `'yyyy-mm-dd'` + `'HH:mm'`.
- `toDateInput(date)` / `toTimeInput(date)` → `'yyyy-mm-dd'` / `'HH:mm'` strings for the inputs.
- `sameDay(a, b)`, `formatDayHeading(date)` ("Segunda, 23 de junho" via `Intl`), `formatTimeRange(startISO, endISO)` ("08:30–09:15"), `formatMonthTitle(year, month)` ("Junho 2026").

## 7. Calendar (Mês) view — `components/agenda/calendar-month.tsx`

A month grid in a card. Weekday header row (Dom…Sáb). 6 rows of day cells; each cell:
- Day number (top-left); **today** highlighted with a teal disc; adjacent-month days dimmed.
- Appointments for that day (from the fetched range, ascending) as **chips**. Each chip label = `HH:mm` + **title** (patient name appears in the list, day panel, and dialog — not the compact chip). **Overflow rule:** max 3 content rows — if the day has ≤3 appointments, one chip each; if >3, show the first **2** chips + a **`+N mais`** row where `N = count − 2`.
- **Click map** (events `stopPropagation` so they don't bubble to the cell):
  - chip → `onEditAppointment(appt)`
  - `+N mais` → `onOpenDay(date, appts)`
  - empty cell area / day number → `onCreateOnDay(date)`

Receives the month's appointments + the callbacks; pure-ish presentational. States: loading (skeleton grid), error (message + retry) handled by the parent `AgendaView`.

## 8. List (Lista) view — `components/agenda/agenda-list.tsx`

The selected month's appointments grouped by day, ascending. Each group: a day heading ("Segunda, 23 de junho", with a "Hoje" badge when it's today); rows with the time range + title + patient name, each row → `onEditAppointment(appt)`. Empty state: "Nenhum agendamento neste mês" + a create CTA. Loading skeleton; error + retry (via parent).

## 9. Day panel — `components/agenda/day-panel.tsx`

A `dialog` opened by `+N mais` (or clicking the day number). Header: the date (e.g., "Terça-feira · 17 de junho", count). Body: **all** that day's appointments chronologically (scrolls internally), each row → opens the edit dialog. Footer: **＋ Novo agendamento neste dia** (opens the create dialog pre-dated to that day). Keeps the month grid stable regardless of event count.

## 10. Create / edit dialog — `components/agenda/appointment-dialog.tsx`

A shadcn `dialog` containing a react-hook-form + zod form. One component handles both modes:
- **Create:** title "Novo agendamento"; defaults — `date` from the clicked day (or today), `startTime` `09:00`, `endTime` `10:00`, empty title/patient/description; no "Excluir".
- **Edit:** title "Editar agendamento"; fields pre-filled from the appointment; **Excluir** shown in the footer (calls `deleteAppointment` then closes + invalidates).
- **Fields:** Título (`Input`, req, ≤200), Paciente (shadcn `Select`, options from `usePatients()`, "Sem paciente" default → `patientId` undefined/null), Data (`<input type="date">`, req), Início + Fim (`<input type="time">`, req), Descrição (`Textarea`, optional, ≤2000).
- **Validation (`appointmentFormSchema`, zod):** title min 1 / max 200; date/start/end present; **end after start** (refine, message "O fim deve ser depois do início."); description ≤2000.
- **Submit:** build `startsAt`/`endsAt` ISO via `combineDateTime`; create → `createAppointment`, edit → `updateAppointment` (send only changed fields; `description` empty → `null` on edit, omitted on create; patient cleared → `null` on edit). On success: toast + close + invalidate. On error: map `409` → "Já existe um agendamento nesse horário." (inline + toast), other `ApiError` → generic pt-BR fallback. Submit disabled while pending.

## 11. AgendaView (container) — `components/agenda/agenda-view.tsx`

Owns: selected `{ year, month }` (default = current), `view` (`'month' | 'list'`), and dialog/day-panel open state. Renders the header (title, `Mês ｜ Lista` segmented toggle, `‹ month ›` + "Hoje", **Novo agendamento** button), then `CalendarMonth` or `AgendaList`. Fetches via `useAppointments(gridRange(year, month))` — one query shared by both views; the list filters/groups to the selected month. Wires the create/edit dialog and the day panel. `page.tsx` renders `<AgendaView />`.

## 12. shadcn components to add

`dialog` (via CLI; if absent from the configured style's registry, hand-author per the canonical shadcn source, as done for `form`). `select`, `textarea`, `input`, `button`, `card`, `skeleton`, `badge` already exist.

## 13. Error handling

- Form: inline zod messages (pt-BR); client guard for fim > início.
- API errors via `ApiError`: `409` overlap → specific message; others → generic. `sonner` toast + inline where relevant.
- Calendar/list: loading skeletons; empty state; error state with retry.
- Mutations disable submit while pending and invalidate `['appointments']` on success.

## 14. Testing (Vitest + Testing Library)

- `lib/agenda/dates` — `monthGrid` (correct 42 cells, inMonth/today flags, Sunday-first), `gridRange`, `combineDateTime`/`toDateInput`/`toTimeInput` round-trips, `formatTimeRange`/`formatDayHeading`/`formatMonthTitle`.
- `lib/api/appointments` — each function builds the right path/method/body and attaches the token (mock fetch + browser token); `from`/`to` serialized.
- `validation` (`appointmentFormSchema`) — accepts valid; rejects empty title, end ≤ start, over-long fields.
- `calendar-month` — renders day numbers + chips from data; a day with ≤3 shows all as chips, a day with >3 shows 2 chips + `+N mais` (N = count−2); today highlighted; chip click → edit cb; `+N mais` → day cb; empty cell click → create cb (with the right date).
- `agenda-list` — groups by day with headings + "Hoje" badge; row click → edit cb; empty state.
- `appointment-dialog` — create: validation blocks submit; valid submit calls `createAppointment` with mapped ISO body + routes/closes; `409` → friendly message. Edit: pre-filled; submit calls `updateAppointment` with changed fields; **Excluir** calls `deleteAppointment`.
- `day-panel` — lists all day appointments; row → edit cb; "Novo neste dia" → create cb (date = that day).
- `agenda-view` — toggle switches Mês/Lista; `‹ / ›` + "Hoje" change the month title; "Novo agendamento" opens the create dialog.

## 15. Out of scope (YAGNI / next slices)

Week and day calendar views; drag-to-reschedule/resize; recurring appointments; reminders/notifications; appointment status (confirmed/cancelled/no-show); syncing selected month/view to the URL; patient-facing agenda (patients use mobile). The `409` overlap is surfaced as an error message, not auto-resolved.
