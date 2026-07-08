'use client';

import type { Appointment } from '@nutri-plus/shared-types';
import { formatTime, groupByDay, monthGrid, toDateInput } from '@/lib/agenda/dates';
import { appointmentColor } from '@/lib/agenda/colors';
import { AppointmentTooltip } from '@/components/agenda/appointment-tooltip';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_CHIPS = 3;

export function CalendarMonth({
  year,
  month,
  today,
  appointments,
  onCreateOnDay,
  onEditAppointment,
  onOpenDay,
}: {
  year: number;
  month: number;
  today?: Date;
  appointments: Appointment[];
  onCreateOnDay: (date: Date) => void;
  onEditAppointment: (appt: Appointment) => void;
  onOpenDay: (date: Date, appts: Appointment[]) => void;
}) {
  const cells = monthGrid(year, month, today);
  const byDay = groupByDay(appointments);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const dayAppts = byDay.get(toDateInput(cell.date)) ?? [];
          const visible = dayAppts.length > MAX_CHIPS ? dayAppts.slice(0, 2) : dayAppts.slice(0, 3);
          const hiddenCount = dayAppts.length - visible.length;
          return (
            <button
              type="button"
              key={cell.date.toISOString()}
              onClick={() => onCreateOnDay(cell.date)}
              aria-label={String(cell.date.getDate())}
              className={cn(
                'flex min-h-[96px] flex-col gap-1 border-b border-r p-1.5 text-left last:border-r-0 [&:nth-child(7n)]:border-r-0',
                !cell.inMonth && 'bg-muted/30',
              )}
            >
              <span
                className={cn(
                  'self-start rounded-full px-1 text-xs font-semibold',
                  !cell.inMonth && 'text-muted-foreground',
                  cell.isToday && 'flex h-[22px] w-[22px] items-center justify-center bg-primary text-primary-foreground',
                )}
              >
                {cell.date.getDate()}
              </span>
              {visible.map((a) => {
                const color = appointmentColor(a);
                return (
                  <AppointmentTooltip key={a.id} appointment={a}>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditAppointment(a);
                      }}
                      style={color ? { borderLeftColor: color } : undefined}
                      className="truncate rounded border-l-[3px] border-primary bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold text-secondary-foreground"
                    >
                      {formatTime(a.startsAt)} {a.title}
                    </span>
                  </AppointmentTooltip>
                );
              })}
              {hiddenCount > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDay(cell.date, dayAppts);
                  }}
                  className="rounded bg-secondary px-1.5 py-0.5 text-center text-[10px] font-bold text-secondary-foreground"
                >
                  +{hiddenCount} mais
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
