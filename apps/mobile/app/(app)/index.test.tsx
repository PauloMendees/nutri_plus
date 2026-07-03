import { render, screen, fireEvent } from '@testing-library/react-native';

const mockUseMyEvolution = jest.fn();
jest.mock('../../lib/queries/assessments', () => ({ useMyEvolution: () => mockUseMyEvolution() }));

import Home from './index';

const two = {
  name: 'Ana',
  height: 170,
  assessments: [
    { id: 'a1', patientId: 'p', assessmentDate: '2026-01-10', weight: 80, bodyFatPercentage: 30, muscleMass: 30, leanMass: null, visceralFat: 10, basalMetabolicRate: 1500, bodyWaterPercentage: 50, boneMass: 3, metabolicAge: 40, waistCircumference: 90, hipCircumference: null, chestCircumference: null, armCircumference: null, thighCircumference: null, notes: null, createdAt: '2026-01-10' },
    { id: 'a2', patientId: 'p', assessmentDate: '2026-02-10', weight: 78, bodyFatPercentage: 28, muscleMass: 31, leanMass: null, visceralFat: 9, basalMetabolicRate: 1520, bodyWaterPercentage: 51, boneMass: 3, metabolicAge: 39, waistCircumference: 88, hipCircumference: null, chestCircumference: null, armCircumference: null, thighCircumference: null, notes: null, createdAt: '2026-02-10' },
  ],
};

beforeEach(() => mockUseMyEvolution.mockReset());

describe('Evolução screen', () => {
  it('shows a loading state', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: true });
    await render(<Home />);
    expect(screen.getByTestId('evolution-loading')).toBeTruthy();
  });

  it('shows the empty state when there are no assessments', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: { name: 'Ana', height: 170, assessments: [] } });
    await render(<Home />);
    expect(screen.getByText('Suas avaliações aparecerão aqui após sua consulta.')).toBeTruthy();
  });

  it('shows an error state with retry', async () => {
    const refetch = jest.fn();
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: true, refetch });
    await render(<Home />);
    await fireEvent.press(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders the greeting, latest snapshot and trend charts from data', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: two });
    await render(<Home />);
    expect(screen.getByText('Olá, Ana')).toBeTruthy();
    expect(screen.getByText('Peso')).toBeTruthy();
    expect(screen.getByText('IMC')).toBeTruthy();
    // latest weight 78 kg is shown (regex: the tile composes '78,0' + ' kg' in one Text)
    expect(screen.getByText(/78,0/)).toBeTruthy();
    // three trend charts → at least one chart path renders (2 points each)
    expect(screen.getAllByTestId('line-chart-path').length).toBeGreaterThanOrEqual(3);
  });
});
