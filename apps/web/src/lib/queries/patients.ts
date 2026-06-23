import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePatientRequest, UpdatePatientRequest } from '@nutri-plus/shared-types';
import { createPatient, getPatient, listPatients, updatePatient } from '@/lib/api/patients';

export function usePatients() {
  return useQuery({ queryKey: ['patients'], queryFn: listPatients });
}

export function usePatient(id: string) {
  return useQuery({ queryKey: ['patient', id], queryFn: () => getPatient(id), enabled: Boolean(id) });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePatientRequest) => createPatient(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }),
  });
}

export function useUpdatePatient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePatientRequest) => updatePatient(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.setQueryData(['patient', id], data);
    },
  });
}
