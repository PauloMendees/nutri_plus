import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateAppointmentCategoryRequest,
  UpdateAppointmentCategoryRequest,
} from '@nutri-plus/shared-types';
import {
  createAppointmentCategory,
  deleteAppointmentCategory,
  listAppointmentCategories,
  updateAppointmentCategory,
} from '@/lib/api/appointment-categories';

export function useAppointmentCategories() {
  return useQuery({ queryKey: ['appointment-categories'], queryFn: listAppointmentCategories });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['appointment-categories'] });
    qc.invalidateQueries({ queryKey: ['appointments'] });
  };
}

export function useCreateAppointmentCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateAppointmentCategoryRequest) => createAppointmentCategory(body),
    onSuccess: invalidate,
  });
}

export function useUpdateAppointmentCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAppointmentCategoryRequest }) =>
      updateAppointmentCategory(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteAppointmentCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deleteAppointmentCategory(id),
    onSuccess: invalidate,
  });
}
