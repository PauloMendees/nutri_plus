import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePatientRequest, ListPatientsParams, UpdatePatientRequest } from '@nutri-plus/shared-types';
import {
  createPatient,
  deletePatientPhoto,
  getPatient,
  listPatients,
  updatePatient,
  uploadPatientPhoto,
} from '@/lib/api/patients';

export function usePatients(params: ListPatientsParams = {}) {
  return useQuery({
    queryKey: ['patients', params],
    queryFn: () => listPatients(params),
    placeholderData: keepPreviousData,
  });
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

export function useUploadPatientPhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadPatientPhoto(id, file),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.setQueryData(['patient', id], data);
    },
  });
}

export function useDeletePatientPhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deletePatientPhoto(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.setQueryData(['patient', id], data);
    },
  });
}
