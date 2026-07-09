import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockMutateAsync = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ router: { back: () => mockBack() } }));
jest.mock('../../lib/queries/assessments', () => ({
  useCreateMyAssessment: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

import NovaMedicao from './nova-medicao';

describe('NovaMedicao', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockBack.mockReset();
  });

  it('submits a metric and navigates back', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'a1' });
    const { getByLabelText, getByText } = await render(<NovaMedicao />);
    await fireEvent.changeText(getByLabelText('Peso (kg)'), '80');
    await fireEvent.press(getByText('Salvar medição'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    expect(mockMutateAsync.mock.calls[0][0]).toEqual(expect.objectContaining({ weight: 80 }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('blocks submit when no metric is provided', async () => {
    const { getByText } = await render(<NovaMedicao />);
    await fireEvent.press(getByText('Salvar medição'));
    await waitFor(() => expect(getByText('Informe ao menos uma métrica.')).toBeTruthy());
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
