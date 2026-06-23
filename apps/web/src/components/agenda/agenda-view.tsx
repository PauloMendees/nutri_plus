'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Appointment } from '@nutri-plus/shared-types';
import { formatMonthTitle, gridRange } from '@/lib/agenda/dates';
import { useAppointments } from '@/lib/queries/appointments';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CalendarMonth } from '@/components/agenda/calendar-month';
import { AgendaList } from '@/components/agenda/agenda-list';
import { DayPanel } from '@/components/agenda/day-panel';
import { AppointmentDialog } from '@/components/agenda/appointment-dialog';

type View = 'month' | 'list';
type DialogState =
  | { mode: 'create'; initialDate?: Date }
  | { mode: 'edit'; appointment: Appointment };

export function AgendaView({ today = new Date() }: { today?: Date }) {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView] = useState<View>('month');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dayPanel, setDayPanel] = useState<{ date: Date; appts: Appointment[] } | null>(null);

  const range = useMemo(() => gridRange(year, month), [year, month]);
  const query = useAppointments({ from: range.from.toISOString(), to: range.to.toISOString() });
  const appointments = query.data ?? [];
  // The calendar shows the full visible grid (incl. adjacent-month days); the
  // list is scoped to the selected month.
  const monthAppointments = useMemo(
    () =>
      appointments.filter((a) => {
        const d = new Date(a.startsAt);
        return d.getFullYear() === year && d.getMonth() === month;
      }),
    [appointments, year, month],
  );

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  const openCreate = (initialDate?: Date) => {
    setDayPanel(null);
    setDialog({ mode: 'create', initialDate });
  };
  const openEdit = (appointment: Appointment) => {
    setDayPanel(null);
    setDialog({ mode: 'edit', appointment });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-2xl font-bold">Agenda</h1>
        <div className="flex-1" />
        <div className="flex rounded-full border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView('month')}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold text-muted-foreground',
              view === 'month' && 'bg-primary text-primary-foreground',
            )}
          >
            Mês
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold text-muted-foreground',
              view === 'list' && 'bg-primary text-primary-foreground',
            )}
          >
            Lista
          </button>
        </div>
        <Button className="rounded-full" onClick={() => openCreate()}>
          Novo agendamento
        </Button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Button variant="outline" size="icon" className="rounded-lg" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[150px] font-heading text-lg font-bold">{formatMonthTitle(year, month)}</span>
        <Button variant="outline" size="icon" className="rounded-lg" aria-label="Próximo mês" onClick={() => shiftMonth(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" className="rounded-full" onClick={goToday}>
          Hoje
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-[560px] w-full" />
      ) : query.isError ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar a agenda.{' '}
          <button type="button" className="font-semibold text-primary underline" onClick={() => query.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : view === 'month' ? (
        <CalendarMonth
          year={year}
          month={month}
          today={today}
          appointments={appointments}
          onCreateOnDay={openCreate}
          onEditAppointment={openEdit}
          onOpenDay={(date, appts) => setDayPanel({ date, appts })}
        />
      ) : (
        <AgendaList appointments={monthAppointments} today={today} onEditAppointment={openEdit} />
      )}

      {dayPanel && (
        <DayPanel
          open
          onOpenChange={(o) => !o && setDayPanel(null)}
          date={dayPanel.date}
          appointments={dayPanel.appts}
          onEditAppointment={openEdit}
          onCreateOnDay={openCreate}
        />
      )}

      {dialog && (
        <AppointmentDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          mode={dialog.mode}
          initialDate={dialog.mode === 'create' ? dialog.initialDate : undefined}
          appointment={dialog.mode === 'edit' ? dialog.appointment : undefined}
        />
      )}
    </div>
  );
}
