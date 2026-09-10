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
  name: 'Maria Silva',
  email: 'maria@x.com',
  phone: '5511999998888',
  inviteStatus: 'NOT_INVITED',
  user: null,
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
  photoUrl: null,
  isDemo: false,
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

  it('renders name, phone and email fields', () => {
    render(<EditPatientForm patient={patient} />);
    expect(screen.getByLabelText(/nome/i)).toHaveValue('Maria Silva');
    expect(screen.getByLabelText(/telefone/i)).toHaveValue('5511999998888');
    expect(screen.getByLabelText(/^e-mail$/i)).toHaveValue('maria@x.com');
    expect(screen.getByLabelText(/^e-mail$/i)).not.toBeDisabled();
  });

  it('disables the email input when the patient is already invited', () => {
    render(<EditPatientForm patient={{ ...patient, inviteStatus: 'INVITED' }} />);
    expect(screen.getByLabelText(/^e-mail$/i)).toBeDisabled();
    expect(screen.getByLabelText(/nome/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/telefone/i)).not.toBeDisabled();
  });
});
