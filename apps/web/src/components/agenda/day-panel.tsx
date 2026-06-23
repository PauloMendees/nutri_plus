'use client';

import type { Appointment } from '@nutri-plus/shared-types';
import { formatDayHeading, formatTimeRange } from '@/lib/agenda/dates';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function DayPanel({
  open,
  onOpenChange,
  date,
  appointments,
  onEditAppointment,
  onCreateOnDay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  appointments: Appointment[];
  onEditAppointment: (appt: Appointment) => void;
  onCreateOnDay: (date: Date) => void;
}) {
  const sorted = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{formatDayHeading(date)}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {appointments.length} {appointments.length === 1 ? 'agendamento' : 'agendamentos'}
          </p>
        </DialogHeader>

        <div className="max-h-[320px] space-y-2 overflow-auto">
          {sorted.map((a) => (
            <button
              type="button"
              key={a.id}
              onClick={() => onEditAppointment(a)}
              className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left"
            >
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
          ))}
        </div>

        <DialogFooter>
          <Button
            type="button"
            className="w-full rounded-full"
            onClick={() => onCreateOnDay(date)}
          >
            ＋ Novo agendamento neste dia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
