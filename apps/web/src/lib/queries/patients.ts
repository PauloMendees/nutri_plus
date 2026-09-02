import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePatientRequest, ListPatientsParams, UpdatePatientRequest } from '@nutri-plus/shared-types';
import {
  createPatient,
  deleteDemoPatient,
  deletePatientPhoto,
  getPatient,
  listPatients,
  updatePatient,
  uploadPatientPhoto,
} from '@/lib/api/patients';
import { ONBOARDING_KEY } from '@/lib/queries/onboarding';
import { trackTrialAtivadoIfReady } from '@/lib/analytics/meta-conversions';

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
      // Metade da condição de TrialAtivado. O servidor decide se dispara.
      void trackTrialAtivadoIfReady();
    },
  });
}

export function useDeleteDemoPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDemoPatient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
    },
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
