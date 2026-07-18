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
    <div className="fixed bottom-4 left-4 z-50 hidden md:block">
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
            {query.isError ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Não foi possível carregar a agenda.
              </p>
            ) : appointments.length === 0 ? (
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
        <AppointmentDialog
          open
          mode="edit"
          appointment={editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      ) : null}
      {creating ? (
        <AppointmentDialog
          open
          mode="create"
          initialDate={today}
          onOpenChange={(o) => !o && setCreating(false)}
        />
      ) : null}
    </div>
  );
}
