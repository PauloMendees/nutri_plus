import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InviteEmployeeRequest, UpdateEmployeeRequest } from '@nutri-plus/shared-types';
import {
  deleteEmployee,
  inviteEmployee,
  listEmployees,
  updateEmployee,
} from '@/lib/api/employees';

export function useEmployees() {
  return useQuery({ queryKey: ['employees'], queryFn: listEmployees });
}

export function useInviteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteEmployeeRequest) => inviteEmployee(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateEmployeeRequest }) =>
      updateEmployee(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}
