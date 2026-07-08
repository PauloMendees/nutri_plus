import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateAppointmentRequest,
  ListAppointmentsQuery,
  UpdateAppointmentRequest,
} from '@nutri-plus/shared-types';
import {
  createAppointment,
  deleteAppointment,
  listAppointments,
  updateAppointment,
} from '@/lib/api/appointments';

export function useAppointments(query: ListAppointmentsQuery) {
  return useQuery({
    queryKey: ['appointments', query.from, query.to],
    queryFn: () => listAppointments(query),
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAppointmentRequest) => createAppointment(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAppointmentRequest }) =>
      updateAppointment(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

export function useDeleteAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAppointment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}
