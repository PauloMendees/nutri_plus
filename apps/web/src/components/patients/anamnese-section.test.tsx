import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PatientAnamnese } from '@nutri-plus/shared-types';

const useAnamneseMock = vi.fn();
const mutateAsync = vi.fn();

vi.mock('@/lib/queries/anamnese', () => ({
  useAnamnese: (...args: unknown[]) => useAnamneseMock(...args),
  useUpsertAnamnese: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AnamneseSection } from './anamnese-section';

function anamnese(over: Partial<PatientAnamnese> = {}): PatientAnamnese {
  return {
    id: 'an1',
    patientId: 'p1',
    mainComplaint: 'Cansaço frequente',
    medications: null,
    familyHistory: null,
    supplements: null,
    sleepHoursPerNight: 7,
    waterIntakeLiters: 2,
    alcoholUse: null,
    smoking: null,
    physicalActivity: null,
    bowelHabit: null,
    mealsPerDay: 4,
    eatingHabits: null,
    foodPreferences: null,
    clinicalNotes: null,
    createdAt: '2026-05-12T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  useAnamneseMock.mockReset().mockReturnValue({ data: anamnese(), isLoading: false });
  mutateAsync.mockReset().mockResolvedValue(anamnese());
});

describe('AnamneseSection', () => {
  it('prefills a field with the fetched anamnese value', () => {
    render(<AnamneseSection patientId="p1" canEdit />);
    expect(screen.getByLabelText(/queixa principal/i)).toHaveValue('Cansaço frequente');
  });

  it('saves via "Salvar" calling the upsert mutation', async () => {
    render(<AnamneseSection patientId="p1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it('submits null (not omitted/undefined) for a field cleared by the user', async () => {
    render(<AnamneseSection patientId="p1" canEdit />);
    const field = screen.getByLabelText(/queixa principal/i);
    await userEvent.clear(field);
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ mainComplaint: null }));
  });

  it('has no Save button and disabled fields when canEdit is false', () => {
    render(<AnamneseSection patientId="p1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/queixa principal/i)).toBeDisabled();
  });
});
