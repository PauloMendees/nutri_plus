'use client';

import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { Appointment } from '@nutri-plus/shared-types';
import { appointmentFormSchema, type AppointmentFormValues } from '@/lib/validation/appointment';
import { combineDateTime, toDateInput, toTimeInput } from '@/lib/agenda/dates';
import {
  useCreateAppointment,
  useDeleteAppointment,
  useUpdateAppointment,
} from '@/lib/queries/appointments';
import { usePatients } from '@/lib/queries/patients';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const NO_PATIENT = 'none';

function defaults(mode: 'create' | 'edit', initialDate?: Date, appointment?: Appointment): AppointmentFormValues {
  if (mode === 'edit' && appointment) {
    const start = new Date(appointment.startsAt);
    const end = new Date(appointment.endsAt);
    return {
      title: appointment.title,
      patientId: appointment.patientId ?? undefined,
      date: toDateInput(start),
      startTime: toTimeInput(start),
      endTime: toTimeInput(end),
      description: appointment.description ?? undefined,
    };
  }
  return {
    title: '',
    patientId: undefined,
    date: toDateInput(initialDate ?? new Date()),
    startTime: '09:00',
    endTime: '10:00',
    description: undefined,
  };
}

function mapError(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) {
    return 'Já existe um agendamento nesse horário.';
  }
  return 'Não foi possível salvar o agendamento. Tente novamente.';
}

export function AppointmentDialog({
  open,
  onOpenChange,
  mode,
  initialDate,
  appointment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initialDate?: Date;
  appointment?: Appointment;
}) {
  const patients = usePatients();
  const create = useCreateAppointment();
  const update = useUpdateAppointment();
  const remove = useDeleteAppointment();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentFormSchema) as Resolver<AppointmentFormValues>,
    defaultValues: defaults(mode, initialDate, appointment),
  });

  // Re-seed the form whenever the dialog opens for a different day/appointment.
  useEffect(() => {
    if (open) {
      form.reset(defaults(mode, initialDate, appointment));
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initialDate, appointment]);

  async function onSubmit(values: AppointmentFormValues) {
    setFormError(null);
    const startsAt = combineDateTime(values.date, values.startTime).toISOString();
    const endsAt = combineDateTime(values.date, values.endTime).toISOString();
    try {
      if (mode === 'edit' && appointment) {
        await update.mutateAsync({
          id: appointment.id,
          body: {
            title: values.title,
            startsAt,
            endsAt,
            description: values.description ?? null,
            patientId: values.patientId ?? null,
          },
        });
        toast.success('Agendamento atualizado.');
      } else {
        await create.mutateAsync({
          title: values.title,
          startsAt,
          endsAt,
          ...(values.description ? { description: values.description } : {}),
          ...(values.patientId ? { patientId: values.patientId } : {}),
        });
        toast.success('Agendamento criado.');
      }
      onOpenChange(false);
    } catch (err) {
      const message = mapError(err);
      setFormError(message);
      toast.error(message);
    }
  }

  async function onDelete() {
    if (!appointment) return;
    try {
      await remove.mutateAsync(appointment.id);
      toast.success('Agendamento excluído.');
      onOpenChange(false);
    } catch {
      toast.error('Não foi possível excluir o agendamento.');
    }
  }

  const pending = form.formState.isSubmitting || create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Editar agendamento' : 'Novo agendamento'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Consulta de retorno" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="patientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paciente</FormLabel>
                  <Select
                    value={field.value || NO_PATIENT}
                    onValueChange={(v) => field.onChange(v === NO_PATIENT ? undefined : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um paciente (opcional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_PATIENT}>Sem paciente</SelectItem>
                      {(patients.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Início *</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Fim *</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Notas sobre o atendimento… (opcional)"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              {mode === 'edit' && (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto rounded-full text-destructive"
                  onClick={onDelete}
                  disabled={remove.isPending}
                >
                  Excluir
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="rounded-full" disabled={pending}>
                {pending ? 'Salvando…' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
