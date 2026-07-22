import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PatientDetail } from '@nutri-plus/shared-types';

const mutateAsync = vi.fn();
vi.mock('@/lib/queries/patients', () => ({
  useUpdatePatient: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EditPatientForm } from './edit-patient-form';

const patient = {
  id: 'p1',
  user: { id: 'u1', name: 'Maria Silva', email: 'maria@x.com' },
  birthDate: '1991-03-14T00:00:00.000Z',
  gender: 'FEMALE',
  height: 165,
  imc: null,
  targetWeight: 62,
  objective: 'WEIGHT_LOSS',
  activityLevel: 'MODERATE',
  restrictions: null,
  allergies: null,
  medicalConditions: null,
  notes: null,
  canLogAssessments: false,
  showMealTargetToPatient: false,
  nutritionistId: 'n1',
  createdAt: '2026-05-12T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  assessments: [],
  latestConsent: null,
} as unknown as PatientDetail;

beforeEach(() => mutateAsync.mockReset());

describe('EditPatientForm', () => {
  it('is editable by default: Save present and fields enabled', () => {
    render(<EditPatientForm patient={patient} />);
    expect(screen.getByRole('button', { name: /salvar alterações/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/altura/i)).not.toBeDisabled();
  });

  it('is read-only when canEdit is false: no Save and fields disabled', () => {
    render(<EditPatientForm patient={patient} canEdit={false} />);
    expect(screen.queryByRole('button', { name: /salvar alterações/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/altura/i)).toBeDisabled();
  });

  it('toggles self-log permission and submits it', async () => {
    mutateAsync.mockResolvedValue({});
    render(<EditPatientForm patient={patient} />);

    fireEvent.click(screen.getByRole('button', { name: /registrar bioimpedância/i }));
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await vi.waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ canLogAssessments: true }),
      ),
    );
  });

  it('renders the "Meta no app" toggle and submits showMealTargetToPatient', async () => {
    mutateAsync.mockResolvedValue({});
    render(<EditPatientForm patient={patient} />);

    expect(screen.getByText('Meta no app')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /mostrar meta no app/i });

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await vi.waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ showMealTargetToPatient: true }),
      ),
    );
  });
});
