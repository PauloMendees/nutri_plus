import { render, screen, fireEvent } from '@testing-library/react-native';

const mockUseMyEvolution = jest.fn();
const mockDownload = jest.fn();
jest.mock('../../lib/queries/assessments', () => ({
  useMyEvolution: () => mockUseMyEvolution(),
  downloadEvolutionPdf: (...args: unknown[]) => mockDownload(...args),
}));

const mockUseMyNutritionTarget = jest.fn();
jest.mock('../../lib/queries/nutrition-target', () => ({
  useMyNutritionTarget: () => mockUseMyNutritionTarget(),
}));

// Only BrandHeader (in the render tree) touches the theme, and it reads `scheme`.
jest.mock('../../lib/theme', () => ({ useTheme: () => ({ scheme: 'dark' }) }));

import Home from './index';

const two = {
  name: 'Ana',
  height: 170,
  assessments: [
    { id: 'a1', patientId: 'p', assessmentDate: '2026-01-10', weight: 80, bodyFatPercentage: 30, muscleMass: 30, leanMass: null, muscleMassPercentage: 42, leanMassPercentage: null, visceralFat: 10, basalMetabolicRate: 1500, bodyWaterPercentage: 50, boneMass: 3, metabolicAge: 40, waistCircumference: 90, hipCircumference: null, chestCircumference: null, armCircumference: null, thighCircumference: null, abdomenCircumference: null, contractedArmCircumference: null, calfCircumference: null, notes: null, createdAt: '2026-01-10', loggedByPatient: false, estimatedFromPhoto: false },
    { id: 'a2', patientId: 'p', assessmentDate: '2026-02-10', weight: 78, bodyFatPercentage: 28, muscleMass: 31, leanMass: null, muscleMassPercentage: 43, leanMassPercentage: null, visceralFat: 9, basalMetabolicRate: 1520, bodyWaterPercentage: 51, boneMass: 3, metabolicAge: 39, waistCircumference: 88, hipCircumference: null, chestCircumference: null, armCircumference: null, thighCircumference: null, abdomenCircumference: null, contractedArmCircumference: null, calfCircumference: null, notes: null, createdAt: '2026-02-10', loggedByPatient: false, estimatedFromPhoto: false },
  ],
};

beforeEach(() => {
  mockUseMyEvolution.mockReset();
  mockUseMyNutritionTarget.mockReset().mockReturnValue({ data: null });
});

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
    // 'Peso'/'IMC' now appear both as a snapshot tile AND a selector chip → use getAllByText
    expect(screen.getAllByText('Peso').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('IMC').length).toBeGreaterThanOrEqual(1);
    // latest weight 78 kg is shown (regex: the tile composes '78,0' + ' kg' in one Text)
    expect(screen.getByText(/78,0/)).toBeTruthy();
    // single selectable chart, defaulting to Peso (2 points → one path)
    expect(screen.getAllByTestId('line-chart-path').length).toBe(1);
  });

  it('offers the newly-added measurements in the metric selector', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: two });
    await render(<Home />);
    // These labels appear only as chips (the Detalhes grid uses '(cm)'/'(%)' suffixes), so they are unique.
    expect(screen.getByText('Massa magra')).toBeTruthy();
    expect(screen.getByText('Abdômen')).toBeTruthy();
    expect(screen.getByText('Braço contraído')).toBeTruthy();
    expect(screen.getByText('Panturrilha')).toBeTruthy();
  });

  it('switches the charted metric when a chip is pressed', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: two });
    await render(<Home />);
    // Default Peso has 2 points → one chart path.
    expect(screen.getAllByTestId('line-chart-path').length).toBe(1);
    // Abdômen is null in both fixture rows → insufficient data: message, no chart.
    await fireEvent.press(screen.getByText('Abdômen'));
    expect(screen.getByText('Sem histórico suficiente para tendência ainda.')).toBeTruthy();
    expect(screen.queryAllByTestId('line-chart-path').length).toBe(0);
  });

  it('exports the evolution PDF when the button is pressed', async () => {
    mockDownload.mockReset().mockResolvedValue(undefined);
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: two });
    await render(<Home />);
    await fireEvent.press(screen.getByText('Exportar PDF'));
    expect(mockDownload).toHaveBeenCalled();
  });

  it('shows the "Estimado por foto" indicator when the latest assessment is photo-estimated', async () => {
    const photoEstimated = {
      ...two,
      assessments: [
        two.assessments[0],
        { ...two.assessments[1], estimatedFromPhoto: true },
      ],
    };
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: photoEstimated });
    await render(<Home />);
    expect(screen.getByText('Estimado por foto')).toBeTruthy();
  });

  it('hides the "Estimado por foto" indicator for a measured (non-estimated) assessment', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: two });
    await render(<Home />);
    expect(screen.queryByText('Estimado por foto')).toBeNull();
  });

  it('shows the "Sua meta" card when a nutrition target is available', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: two });
    mockUseMyNutritionTarget.mockReturnValue({
      data: { targetCalories: 2000, proteinGrams: 144, carbGrams: 231, fatGrams: 56 },
    });
    await render(<Home />);
    expect(screen.getByText('Sua meta diária')).toBeTruthy();
    expect(screen.getByText('2.000 kcal')).toBeTruthy();
    expect(screen.getByText('Proteína 144 g')).toBeTruthy();
  });

  it('hides the "Sua meta" card when there is no nutrition target', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: two });
    mockUseMyNutritionTarget.mockReturnValue({ data: null });
    await render(<Home />);
    expect(screen.queryByText('Sua meta diária')).toBeNull();
  });

  it('shows the "Sua meta" card in the empty state (no assessments yet)', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: { name: 'Ana', height: 170, assessments: [] } });
    mockUseMyNutritionTarget.mockReturnValue({
      data: { targetCalories: 2000, proteinGrams: 144, carbGrams: 231, fatGrams: 56 },
    });
    await render(<Home />);
    expect(screen.getByText('Suas avaliações aparecerão aqui após sua consulta.')).toBeTruthy();
    expect(screen.getByText('Sua meta diária')).toBeTruthy();
    expect(screen.getByText('2.000 kcal')).toBeTruthy();
  });

  it('hides the "Sua meta" card in the empty state when there is no nutrition target', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: { name: 'Ana', height: 170, assessments: [] } });
    mockUseMyNutritionTarget.mockReturnValue({ data: null });
    await render(<Home />);
    expect(screen.getByText('Suas avaliações aparecerão aqui após sua consulta.')).toBeTruthy();
    expect(screen.queryByText('Sua meta diária')).toBeNull();
  });
});
