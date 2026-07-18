# Today's-Agenda Floating Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A floating, minimizable bottom-right popup in the nutritionist web app showing today's agenda, with click-to-edit and quick-create.

**Architecture:** One new client component mounted globally in the `(app)` layout; reuses the existing `useAppointments` query, agenda helpers, and `AppointmentDialog`. No API/shared-types/DB change.

**Tech Stack:** Next.js (App Router) + react-query + NativeWind-less Tailwind, `@nutri-plus/shared-types`, vitest + @testing-library/react.

## Global Constraints

- Branch `feat/today-agenda-widget` (off main; spec committed 8dc2938). NO new dependencies.
- pt-BR copy. Web tests = **vitest**. Match the `agenda/` folder quote style (**double quotes**) in the new component + test; the `(app)/layout.tsx` file uses **single quotes** — match it there.
- Read-only reuse of the appointments query + `AppointmentDialog`; **no API/shared-types/DB change**. Guard `localStorage`/`window` for SSR (mounted gate).
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push/PR. Verify web `test` + `tsc --noEmit`.

---

### Task 1: Today's-agenda floating widget

**Files:**
- Create: `apps/web/src/components/agenda/today-agenda-widget.tsx`
- Create: `apps/web/src/components/agenda/today-agenda-widget.test.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx` (mount the widget)

**Interfaces (consumed, all existing):**
- `useAppointments(query: { from?: string; to?: string })` from `@/lib/queries/appointments` (query key `['appointments', from, to]`).
- `startOfDay(d: Date): Date` and `formatTimeRange(startISO: string, endISO: string): string` from `@/lib/agenda/dates`.
- `appointmentColor(appt: Pick<Appointment,'category'>): string | null` from `@/lib/agenda/colors`.
- `AppointmentDialog` (`@/components/agenda/appointment-dialog`) props `{ open: boolean; onOpenChange: (open: boolean) => void; initialDate?: Date; appointment?: Appointment }` — fetches its own categories + owns the create/update/delete mutations (which invalidate `['appointments']`).
- `Appointment` type: `{ id, title, description, startsAt, endsAt, patient: { user: { name } } | null, category?, categoryId?, ... }` (ISO date strings).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/agenda/today-agenda-widget.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Appointment } from "@nutri-plus/shared-types";

const useAppointments = vi.fn();
vi.mock("@/lib/queries/appointments", () => ({
  useAppointments: (...a: unknown[]) => useAppointments(...a),
  useCreateAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/queries/patients", () => ({ usePatients: () => ({ data: [] }) }));
vi.mock("@/lib/queries/appointment-categories", () => ({
  useAppointmentCategories: () => ({ data: [], isLoading: false }),
}));
const pathname = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

import { TodayAgendaWidget } from "./today-agenda-widget";

function appt(over: Partial<Appointment> = {}): Appointment {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    id: "ap1",
    nutritionistId: "n1",
    patientId: "p1",
    title: "Consulta",
    description: null,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
    patient: { id: "p1", user: { id: "u1", name: "Ana Souza", email: "ana@x.com" } },
    categoryId: null,
    category: null,
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  pathname.mockReturnValue("/patients");
  useAppointments.mockReset().mockReturnValue({ data: [appt()], isLoading: false, isError: false });
});

describe("TodayAgendaWidget", () => {
  it("renders today's appointments with title and patient", () => {
    render(<TodayAgendaWidget />);
    expect(screen.getByText("Agenda de hoje")).toBeInTheDocument();
    expect(screen.getByText(/Consulta/)).toBeInTheDocument();
    expect(screen.getByText(/Ana Souza/)).toBeInTheDocument();
  });

  it("opens the appointment dialog when a row is clicked", async () => {
    render(<TodayAgendaWidget />);
    await userEvent.click(screen.getByText(/Consulta/));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("minimizes to a pill with the count and expands back", async () => {
    render(<TodayAgendaWidget />);
    await userEvent.click(screen.getByRole("button", { name: /minimizar/i }));
    expect(screen.getByText("Hoje · 1")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Hoje · 1"));
    expect(screen.getByText("Agenda de hoje")).toBeInTheDocument();
  });

  it("shows an empty state with no appointments", () => {
    useAppointments.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<TodayAgendaWidget />);
    expect(screen.getByText("Sem agendamentos hoje.")).toBeInTheDocument();
  });

  it("renders nothing on the /agenda route", () => {
    pathname.mockReturnValue("/agenda");
    const { container } = render(<TodayAgendaWidget />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `pnpm --filter @nutri-plus/web test -- today-agenda-widget`
Expected: FAIL (`today-agenda-widget` module not found).

- [ ] **Step 3: Implement the widget**

Create `apps/web/src/components/agenda/today-agenda-widget.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Minus, Plus } from "lucide-react";
import type { Appointment } from "@nutri-plus/shared-types";
import { useAppointments } from "@/lib/queries/appointments";
import { startOfDay, formatTimeRange } from "@/lib/agenda/dates";
import { appointmentColor } from "@/lib/agenda/colors";
import { AppointmentDialog } from "@/components/agenda/appointment-dialog";

const STORAGE_KEY = "today-agenda-widget:minimized";

// Today's [00:00, 23:59:59.999] window as ISO strings. Derived from startOfDay
// so the query key is stable across renders within the same day.
function todayRange(): { from: string; to: string } {
  const start = startOfDay(new Date());
  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
  };
}

export function TodayAgendaWidget() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);

  // Read the persisted collapsed preference after mount (SSR/hydration-safe).
  useEffect(() => {
    setMounted(true);
    setMinimized(window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);
  useEffect(() => {
    if (mounted) window.localStorage.setItem(STORAGE_KEY, String(minimized));
  }, [mounted, minimized]);

  const { from, to } = todayRange();
  const query = useAppointments({ from, to });
  const appointments = [...(query.data ?? [])].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );

  // Don't render until mounted (localStorage read) or on the agenda page itself.
  if (!mounted || pathname === "/agenda") return null;

  const today = new Date();

  return (
    <div className="fixed bottom-4 right-4 z-50 hidden md:block">
      {minimized ? (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-semibold shadow-lg hover:bg-muted/40"
        >
          <Calendar className="h-4 w-4 text-primary" aria-hidden="true" />
          Hoje · {appointments.length}
        </button>
      ) : (
        <div className="flex max-h-[60vh] w-80 flex-col rounded-xl border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-bold">Agenda de hoje</p>
              <p className="text-xs text-muted-foreground">{today.toLocaleDateString("pt-BR")}</p>
            </div>
            <button
              type="button"
              aria-label="Minimizar"
              onClick={() => setMinimized(true)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted/40"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {appointments.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Sem agendamentos hoje.
              </p>
            ) : (
              <ul className="space-y-1">
                {appointments.map((a) => {
                  const color = appointmentColor(a);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setEditing(a)}
                        className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-muted/40"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full bg-primary"
                          style={color ? { backgroundColor: color } : undefined}
                        />
                        <span className="min-w-[84px] text-xs font-bold text-muted-foreground">
                          {formatTimeRange(a.startsAt, a.endsAt)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {a.title}
                          {a.patient ? (
                            <span className="font-normal text-muted-foreground"> · {a.patient.user.name}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between border-t px-3 py-2">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Novo
            </button>
            <Link href="/agenda" className="text-xs text-muted-foreground hover:underline">
              Ver agenda completa
            </Link>
          </div>
        </div>
      )}

      {editing ? (
        <AppointmentDialog open appointment={editing} onOpenChange={(o) => !o && setEditing(null)} />
      ) : null}
      {creating ? (
        <AppointmentDialog open initialDate={today} onOpenChange={(o) => !o && setCreating(false)} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Mount the widget in the app layout**

In `apps/web/src/app/(app)/layout.tsx` (single quotes), add the import with the other component imports:
```tsx
import { TodayAgendaWidget } from '@/components/agenda/today-agenda-widget';
```
and render it inside `<SidebarInset>`, right after the `</main>` close tag:
```tsx
        <main className="flex-1 p-6 md:p-8">{children}</main>
        <TodayAgendaWidget />
      </SidebarInset>
```

- [ ] **Step 5: Run the test — expect PASS**

Run: `pnpm --filter @nutri-plus/web test -- today-agenda-widget`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck + full web suite**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit` (exit 0) then `pnpm --filter @nutri-plus/web test` (whole suite green).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/agenda/today-agenda-widget.tsx apps/web/src/components/agenda/today-agenda-widget.test.tsx "apps/web/src/app/(app)/layout.tsx"
git commit -m "feat(web): floating today's-agenda widget on the dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

```bash
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
```

Manual (web): log in as a nutritionist → a bottom-right card "Agenda de hoje" lists today's appointments; minimize collapses it to a "Hoje · N" pill (persists across reloads); clicking a row opens the edit dialog; "+ Novo" opens the create dialog; the widget is hidden on `/agenda` and on small screens.
