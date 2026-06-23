'use client';

import type { Appointment } from '@nutri-plus/shared-types';
import { formatDayHeading, formatTimeRange, groupByDay, sameDay } from '@/lib/agenda/dates';
import { appointmentColor } from '@/lib/agenda/colors';
import { AppointmentTooltip } from '@/components/agenda/appointment-tooltip';
import { Button } from '@/components/ui/button';

export function AgendaList({
  appointments,
  today = new Date(),
  onEditAppointment,
  onCreate,
}: {
  appointments: Appointment[];
  today?: Date;
  onEditAppointment: (appt: Appointment) => void;
  onCreate?: () => void;
}) {
  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhum agendamento neste mês.
        {onCreate && (
          <div className="mt-4">
            <Button className="rounded-full" onClick={onCreate}>
              Novo agendamento
            </Button>
          </div>
        )}
      </div>
    );
  }

  const byDay = [...groupByDay(appointments).entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-5">
      {byDay.map(([key, appts]) => {
        const date = new Date(appts[0].startsAt);
        return (
          <div key={key}>
            <div className="mb-2 flex items-center gap-2 px-0.5 text-sm font-bold text-primary">
              {formatDayHeading(date)}
              {sameDay(date, today) && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-secondary-foreground">
                  Hoje
                </span>
              )}
            </div>
            <div className="space-y-2">
              {appts.map((a) => {
                const color = appointmentColor(a);
                return (
                  <AppointmentTooltip key={a.id} appointment={a}>
                    <button
                      type="button"
                      onClick={() => onEditAppointment(a)}
                      className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full bg-primary"
                        style={color ? { backgroundColor: color } : undefined}
                      />
                      <span className="min-w-[96px] text-xs font-bold text-muted-foreground">
                        {formatTimeRange(a.startsAt, a.endsAt)}
                      </span>
                      <span className="text-sm font-semibold">
                        {a.title}
                        {a.patient && (
                          <span className="font-medium text-muted-foreground"> · {a.patient.user.name}</span>
                        )}
                      </span>
                    </button>
                  </AppointmentTooltip>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
