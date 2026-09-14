import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockMutate = jest.fn();
let mockState: any = { mutate: mockMutate, isPending: false, isError: false, data: undefined };
jest.mock('../../lib/queries/outside-home', () => ({ useOutsideHome: () => mockState }));

// Only BrandHeader (in the render tree) touches the theme, and it reads `scheme`.
jest.mock('../../lib/theme', () => ({ useTheme: () => ({ scheme: 'dark' }) }));

jest.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
import { ApiError } from '../../lib/api';

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

  it('429 mostra a mensagem do servidor (teto diário)', async () => {
    mockState = {
      mutate: mockMutate, isPending: false, isError: true, data: undefined,
      error: new ApiError(429, { code: 'AI_DAILY_CAP_EXCEEDED', message: 'Limite diário de IA atingido. Tente amanhã.' }),
    };
    await render(<ForaDeCasa />);
    expect(screen.getByText('Limite diário de IA atingido. Tente amanhã.')).toBeTruthy();
    expect(screen.queryByText(/não foi possível gerar/i)).toBeNull();
  });

  it('outros erros mantêm a mensagem genérica', async () => {
    mockState = { mutate: mockMutate, isPending: false, isError: true, data: undefined, error: new Error('boom') };
    await render(<ForaDeCasa />);
    expect(screen.getByText(/não foi possível gerar a sugestão/i)).toBeTruthy();
  });
});
