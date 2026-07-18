import { render } from '@testing-library/react-native';

const mockUseMyEvolution = jest.fn();
jest.mock('../../lib/queries/assessments', () => ({ useMyEvolution: () => mockUseMyEvolution() }));
jest.mock('../../lib/queries/nutrition-target', () => ({ useMyNutritionTarget: () => ({ data: null }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// Only BrandHeader (in the render tree) touches the theme, and it reads `scheme`.
jest.mock('../../lib/theme', () => ({ useTheme: () => ({ scheme: 'dark' }) }));

import Home from './index';

const base = { name: 'Ana', height: 165, assessments: [] as unknown[] };

describe('Evolução self-log gate', () => {
  it('shows "Registrar medição" when canLog is true', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: { ...base, canLog: true } });
    const { getByText } = await render(<Home />);
    expect(getByText('Registrar medição')).toBeTruthy();
  });

  it('hides it 100% when canLog is false', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: { ...base, canLog: false } });
    const { queryByText } = await render(<Home />);
    expect(queryByText('Registrar medição')).toBeNull();
  });

  it('shows "Registrar medição" on the main render (non-empty assessments) when canLog is true', async () => {
    const assessments = [
      {
        id: 'a1',
        patientId: 'p',
        assessmentDate: '2026-01-10',
        weight: 80,
        bodyFatPercentage: 30,
        muscleMass: 30,
        leanMass: null,
        visceralFat: 10,
        basalMetabolicRate: 1500,
        bodyWaterPercentage: 50,
        boneMass: 3,
        metabolicAge: 40,
        waistCircumference: 90,
        hipCircumference: null,
        chestCircumference: null,
        armCircumference: null,
        thighCircumference: null,
        notes: null,
        createdAt: '2026-01-10',
      },
    ];
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: { ...base, assessments, canLog: true } });
    const { getByText } = await render(<Home />);
    expect(getByText('Registrar medição')).toBeTruthy();
  });
});
