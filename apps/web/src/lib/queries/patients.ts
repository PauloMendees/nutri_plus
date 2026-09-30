import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePatientRequest, ListPatientsParams, UpdatePatientRequest } from '@nutri-plus/shared-types';
import {
  createPatient,
  deleteDemoPatient,
  deletePatient,
  deletePatientPhoto,
  getPatient,
  invitePatient,
  listPatients,
  updatePatient,
  uploadPatientPhoto,
} from '@/lib/api/patients';
import { ONBOARDING_KEY } from '@/lib/queries/onboarding';
import { ApiError } from '@/lib/api/client';
import { trackTrialAtivadoIfReady } from '@/lib/analytics/meta-conversions';

export function usePatients(params: ListPatientsParams = {}) {
  return useQuery({
    queryKey: ['patients', params],
    queryFn: () => listPatients(params),
    placeholderData: keepPreviousData,
  });
}

// 404 é definitivo (paciente excluído ou de outra nutricionista): sem as 3
// tentativas padrão, a ficha mostra "não encontrado" na hora.
export function usePatient(id: string) {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: () => getPatient(id),
    enabled: Boolean(id),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePatientRequest) => createPatient(body),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
      // Metade da condição de TrialAtivado. O servidor decide se dispara.
      // Paciente de demonstração do tour não conta para a ativação, então
      // nem vale a ida ao servidor — ele responderia `fired: false`.
      if (!body.demo) void trackTrialAtivadoIfReady();
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

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmName }: { id: string; confirmName: string }) => deletePatient(id, confirmName),
    onSuccess: () => {
      // Sem removeQueries(['patient', id]): a ficha ainda está aberta e
      // buscaria de novo o paciente apagado; o diálogo navega para a lista e o
      // cache órfão expira sozinho.
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
      // A exclusão em cascata leva as consultas e as interações de IA do
      // paciente: agenda e lista de gerações não podem mostrá-las do cache.
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['ai-jobs'] });
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

export function useInvitePatient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invitePatient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient', id] });
      qc.invalidateQueries({ queryKey: ['patients'] });
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
