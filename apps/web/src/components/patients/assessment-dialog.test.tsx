import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BodyAssessment } from '@nutri-plus/shared-types';

const createMut = vi.fn();
const updateMut = vi.fn();
const deleteMut = vi.fn();

vi.mock('@/lib/queries/assessments', () => ({
  useCreateAssessment: () => ({ mutateAsync: createMut, isPending: false }),
  useUpdateAssessment: () => ({ mutateAsync: updateMut, isPending: false }),
  useDeleteAssessment: () => ({ mutateAsync: deleteMut, isPending: false }),
}));

import { AssessmentDialog } from './assessment-dialog';

const onOpenChange = vi.fn();

const assessment: BodyAssessment = {
  id: 'a1',
  patientId: 'p1',
  assessmentDate: '2026-05-12T00:00:00.000Z',
  weight: 78.2,
  bodyFatPercentage: 22,
  muscleMass: null,
  leanMass: null,
  muscleMassPercentage: 34,
  leanMassPercentage: 60,
  visceralFat: null,
  basalMetabolicRate: 1680,
  bodyWaterPercentage: null,
  boneMass: null,
  metabolicAge: null,
  waistCircumference: 82,
  hipCircumference: null,
  chestCircumference: null,
  armCircumference: null,
  thighCircumference: null,
  abdomenCircumference: null,
  contractedArmCircumference: null,
  calfCircumference: null,
  notes: null,
  createdAt: '2026-05-12T00:00:00.000Z',
  loggedByPatient: false,
};

beforeEach(() => {
  createMut.mockReset().mockResolvedValue({});
  updateMut.mockReset().mockResolvedValue({});
  deleteMut.mockReset().mockResolvedValue(undefined);
  onOpenChange.mockReset();
});

describe('AssessmentDialog', () => {
  it('create: submits the typed weight', async () => {
    render(<AssessmentDialog open onOpenChange={onOpenChange} patientId='p1' />);
    expect(screen.getByLabelText(/data da avaliação/i)).toHaveValue(new Date().toISOString().slice(0, 10));
    await userEvent.type(screen.getByLabelText(/peso/i), '80');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1));
    expect(createMut.mock.calls[0][0].weight).toBe(80);
  });

  it('edit: prefills and updates with the assessment id', async () => {
    render(<AssessmentDialog open onOpenChange={onOpenChange} patientId='p1' assessment={assessment} />);
    expect(screen.getByLabelText(/peso/i)).toHaveValue(78.2);
    expect(screen.getByLabelText('Massa muscular (%)')).toHaveValue(34);
    expect(screen.getByLabelText('Massa magra (%)')).toHaveValue(60);
    expect(screen.getByLabelText('Abdômen (cm)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
    expect(updateMut.mock.calls[0][0].id).toBe('a1');
  });

  it('edit: deleting requires inline confirmation then removes', async () => {
    render(<AssessmentDialog open onOpenChange={onOpenChange} patientId='p1' assessment={assessment} />);
    await userEvent.click(screen.getByRole('button', { name: /excluir/i }));
    expect(screen.getByText(/não pode ser desfeita/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^excluir$/i }));
    await waitFor(() => expect(deleteMut).toHaveBeenCalledWith('a1'));
  });

  it('shows the "ao menos uma métrica" error on an empty submit', async () => {
    render(<AssessmentDialog open onOpenChange={onOpenChange} patientId='p1' />);
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    expect(await screen.findByText(/ao menos uma métrica/i)).toBeInTheDocument();
    expect(createMut).not.toHaveBeenCalled();
  });
});
