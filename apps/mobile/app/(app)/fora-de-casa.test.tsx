import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockMutate = jest.fn();
let mockState: any = { mutate: mockMutate, isPending: false, isError: false, data: undefined };
jest.mock('../../lib/queries/outside-home', () => ({ useOutsideHome: () => mockState }));

import ForaDeCasa from './fora-de-casa';

beforeEach(() => {
  mockMutate.mockReset();
  mockState = { mutate: mockMutate, isPending: false, isError: false, data: undefined };
});

describe('Fora de casa screen', () => {
  it('submits the message', async () => {
    await render(<ForaDeCasa />);
    await fireEvent.changeText(screen.getByLabelText('Sua situação'), 'Estou num restaurante');
    await fireEvent.press(screen.getByRole('button', { name: /pedir sugestão/i }));
    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({ message: 'Estou num restaurante' }));
  });

  it('shows the suggestion', async () => {
    mockState = { mutate: mockMutate, isPending: false, isError: false, data: { suggestion: 'Peça salada.' } };
    await render(<ForaDeCasa />);
    expect(screen.getByText('Peça salada.')).toBeTruthy();
  });
});
