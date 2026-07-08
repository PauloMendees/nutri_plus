import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateAssessmentRequest, UpdateAssessmentRequest } from '@nutri-plus/shared-types';
import {
  createAssessment,
  deleteAssessment,
  listAssessments,
  updateAssessment,
} from '@/lib/api/assessments';

export function useAssessments(patientId: string) {
  return useQuery({
    queryKey: ['assessments', patientId],
    queryFn: () => listAssessments(patientId),
    enabled: Boolean(patientId),
  });
}

function useInvalidateAssessments(patientId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['assessments', patientId] });
}

export function useCreateAssessment(patientId: string) {
  const invalidate = useInvalidateAssessments(patientId);
  return useMutation({
    mutationFn: (body: CreateAssessmentRequest) => createAssessment(patientId, body),
    onSuccess: invalidate,
  });
}

export function useUpdateAssessment(patientId: string) {
  const invalidate = useInvalidateAssessments(patientId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAssessmentRequest }) =>
      updateAssessment(patientId, id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteAssessment(patientId: string) {
  const invalidate = useInvalidateAssessments(patientId);
  return useMutation({
    mutationFn: (id: string) => deleteAssessment(patientId, id),
    onSuccess: invalidate,
  });
}
