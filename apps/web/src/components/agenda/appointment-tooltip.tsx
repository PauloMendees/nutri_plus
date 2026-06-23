'use client';

import type { ReactNode } from 'react';
import type { Appointment } from '@nutri-plus/shared-types';
import { formatDayHeading, formatTimeRange } from '@/lib/agenda/dates';
import { appointmentColor } from '@/lib/agenda/colors';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Wraps an appointment trigger (chip/row) and shows its full details on hover/focus.
// Self-contained: brings its own TooltipProvider so any caller works without a
// global provider (and component tests render standalone).
export function AppointmentTooltip({
  appointment,
  children,
}: {
  appointment: Appointment;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-0.5 text-left">
            <p className="flex items-center gap-1.5 font-semibold">
              <span
                className="size-2 shrink-0 rounded-full bg-primary"
                style={appointmentColor(appointment) ? { backgroundColor: appointmentColor(appointment)! } : undefined}
              />
              {appointment.title}
            </p>
            <p className="text-background/80">
              {formatDayHeading(new Date(appointment.startsAt))} ·{' '}
              {formatTimeRange(appointment.startsAt, appointment.endsAt)}
            </p>
            {appointment.patient && (
              <p className="text-background/80">{appointment.patient.user.name}</p>
            )}
            {appointment.description && (
              <p className="text-background/70">{appointment.description}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
