import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';

const usePatient = vi.fn();
const mutateAsync = vi.fn();
const uploadPhotoMut = vi.fn();
const deletePhotoMut = vi.fn();

vi.mock('@/lib/queries/patients', () => ({
  usePatient: (id: string) => usePatient(id),
  useUpdatePatient: () => ({ mutateAsync, isPending: false }),
  useUploadPatientPhoto: () => ({ mutateAsync: uploadPhotoMut, isPending: false }),
  useDeletePatientPhoto: () => ({ mutateAsync: deletePhotoMut, isPending: false }),
}));
vi.mock('@/lib/queries/assessments', () => ({
  useAssessments: () => ({ data: [], isLoading: false, isError: false }),
  useCreateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/queries/meal-plans', () => ({
  useMealPlans: () => ({ data: [], isLoading: false, isError: false }),
  useGenerateMealPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

import { PatientDetail } from './patient-detail';

const patient = {
  id: 'p1',
  user: { id: 'u1', name: 'Maria Silva', email: 'maria@x.com' },
  birthDate: '1991-03-14T00:00:00.000Z',
  gender: 'FEMALE',
  height: 165,
  targetWeight: 62,
  objective: 'WEIGHT_LOSS',
  activityLevel: 'MODERATE',
  restrictions: null,
  allergies: null,
  medicalConditions: null,
  notes: null,
  nutritionistId: 'n1',
  createdAt: '2026-05-12T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  assessments: [],
};

beforeEach(() => {
  usePatient.mockReset();
  mutateAsync.mockReset();
  uploadPhotoMut.mockReset();
  deletePhotoMut.mockReset();
});

describe('PatientDetail', () => {
  it('shows a not-found state on 404', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: true, error: new ApiError(404, {}) });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByText(/não encontrado/i)).toBeInTheDocument();
  });

  it('renders the persistent header and the three section tabs', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('maria@x.com')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /dados/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /bioimpedância/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /planos alimentares/i })).toBeInTheDocument();
  });

  it('reveals the bioimpedância placeholder when its tab is selected', async () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} />);
    // Bioimpedância lives in an inactive tab, so it is not mounted by default.
    expect(screen.queryByText(/nenhuma avaliação ainda/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /bioimpedância/i }));
    expect(await screen.findByText(/nenhuma avaliação ainda/i)).toBeInTheDocument();
  });

  it('shows the post-create banner only when created', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    const { rerender } = render(<PatientDetail id="p1" created={false} />);
    expect(screen.queryByText(/criado e convidado/i)).not.toBeInTheDocument();
    rerender(<PatientDetail id="p1" created />);
    expect(screen.getByText(/criado e convidado/i)).toBeInTheDocument();
  });

  it('saves clinical edits via updatePatient', async () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    mutateAsync.mockResolvedValue(patient);
    render(<PatientDetail id="p1" created={false} />);
    await userEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  });

  it('hides Save when canEdit is false', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit={false} />);
    expect(screen.queryByRole('button', { name: /salvar alterações/i })).not.toBeInTheDocument();
  });

  it('uploads a chosen photo through the mutation when the nutritionist can edit', async () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    const user = userEvent.setup();
    render(<PatientDetail id="p1" created={false} canEdit />);
    const file = new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Foto do paciente'), file);
    expect(uploadPhotoMut).toHaveBeenCalledWith(file);
  });
});
