import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PatientDetail } from '@nutri-plus/shared-types';

const listMut = vi.fn();
const createMut = vi.fn();

vi.mock('@/lib/queries/nutrition-targets', () => ({
  useNutritionTargets: (...args: unknown[]) => listMut(...args),
  useCreateNutritionTarget: () => ({ mutateAsync: createMut, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { NutritionTargetsSection } from './nutrition-targets-section';

function assessment(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    patientId: 'p1',
    assessmentDate: '2026-05-12T00:00:00.000Z',
    weight: 80,
    bodyFatPercentage: 20,
    muscleMass: null,
    leanMass: null,
    muscleMassPercentage: null,
    leanMassPercentage: null,
    visceralFat: null,
    basalMetabolicRate: null,
    bodyWaterPercentage: null,
    boneMass: null,
    metabolicAge: null,
    waistCircumference: null,
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
    estimatedFromPhoto: false,
    ...over,
  };
}

function patient(over: Record<string, unknown> = {}): PatientDetail {
  return {
    id: 'p1',
    user: { id: 'u1', name: 'João Souza', email: 'joao@x.com' },
    nutritionistId: 'n1',
    birthDate: '1990-06-15T00:00:00.000Z',
    gender: 'MALE',
    height: 180,
    imc: 24.7,
    targetWeight: 75,
    objective: 'WEIGHT_LOSS',
    activityLevel: 'MODERATE',
    restrictions: null,
    allergies: null,
    medicalConditions: null,
    notes: null,
    canLogAssessments: true,
    photoUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assessments: [assessment()],
    ...over,
  } as unknown as PatientDetail;
}

beforeEach(() => {
  listMut.mockReset().mockReturnValue({ data: [], isLoading: false });
  createMut.mockReset().mockResolvedValue({ id: 't1' });
});

describe('NutritionTargetsSection', () => {
  it('computes and shows TMB and GET from the prefilled patient data', () => {
    render(<NutritionTargetsSection patient={patient()} />);
    expect(screen.getByTestId('nt-tmb-value')).not.toHaveTextContent('—');
    expect(screen.getByTestId('nt-get-value')).not.toHaveTextContent('—');
    // Both should render a plain number (pt-BR formatted).
    expect(screen.getByTestId('nt-tmb-value').textContent).toMatch(/\d/);
    expect(screen.getByTestId('nt-get-value').textContent).toMatch(/\d/);
  });

  it('disables the Katch option when there is no body-fat percentage', () => {
    render(
      <NutritionTargetsSection
        patient={patient({ assessments: [assessment({ bodyFatPercentage: null })] })}
      />,
    );
    expect(screen.getByRole('option', { name: /katch-mcardle/i })).toBeDisabled();
  });

  it('does not disable the Katch option when a body-fat percentage is available', () => {
    render(<NutritionTargetsSection patient={patient()} />);
    expect(screen.getByRole('option', { name: /katch-mcardle/i })).toBeEnabled();
  });

  it('saves a target via "Usar sugestão" + "Salvar meta" with the expected body', async () => {
    render(<NutritionTargetsSection patient={patient()} />);

    await userEvent.click(screen.getByRole('button', { name: /usar sugestão/i }));
    await userEvent.click(screen.getByRole('button', { name: /salvar meta/i }));

    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1));
    const body = createMut.mock.calls[0][0];
    expect(body).toMatchObject({
      formula: 'MIFFLIN',
      sex: 'MALE',
      weightKg: 80,
      proteinGramsPerKg: 1.8,
      fatPercent: 25,
    });
    expect(body.targetCalories).toBeGreaterThan(0);
  });

  it('disables "Salvar meta" until a target calorie value is set', () => {
    render(<NutritionTargetsSection patient={patient()} />);
    expect(screen.getByRole('button', { name: /salvar meta/i })).toBeDisabled();
  });

  it('disables "Salvar meta" when no activity level is set', async () => {
    render(<NutritionTargetsSection patient={patient({ activityLevel: null })} />);

    // No activity level means no GET/suggestion is computed, so "Usar sugestão"
    // never renders — fill the target calories manually to isolate the check.
    const targetCaloriesInput = screen.getByLabelText(/meta calórica/i);
    await userEvent.clear(targetCaloriesInput);
    await userEvent.type(targetCaloriesInput, '2000');

    expect(screen.getByRole('button', { name: /salvar meta/i })).toBeDisabled();
  });

  it('enables "Salvar meta" once every required field, including activity level, is set', async () => {
    render(<NutritionTargetsSection patient={patient()} />);

    await userEvent.click(screen.getByRole('button', { name: /usar sugestão/i }));

    expect(screen.getByRole('button', { name: /salvar meta/i })).toBeEnabled();
  });

  it('renders prior targets in the history list', () => {
    listMut.mockReturnValue({
      data: [
        {
          id: 't0',
          patientId: 'p1',
          targetDate: '2026-05-01T00:00:00.000Z',
          createdAt: '2026-05-01T00:00:00.000Z',
          formula: 'MIFFLIN',
          sex: 'MALE',
          age: 35,
          heightCm: 180,
          weightKg: 80,
          bodyFatPercentage: 20,
          activityLevel: 'MODERATE',
          activityFactor: 1.55,
          tmb: 1800,
          get: 2790,
          targetCalories: 1800,
          proteinGramsPerKg: 1.8,
          proteinGrams: 150,
          fatPercent: 25,
          fatGrams: 50,
          carbGrams: 200,
        },
      ],
      isLoading: false,
    });
    render(<NutritionTargetsSection patient={patient()} />);
    expect(screen.getByText(/1\.800 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/P 150g/)).toBeInTheDocument();
    expect(screen.getByText(/C 200g/)).toBeInTheDocument();
    expect(screen.getByText(/G 50g/)).toBeInTheDocument();
  });

  it('shows an empty-history message when there are no prior targets', () => {
    render(<NutritionTargetsSection patient={patient()} />);
    expect(screen.getByText(/nenhuma meta registrada ainda/i)).toBeInTheDocument();
  });
});
