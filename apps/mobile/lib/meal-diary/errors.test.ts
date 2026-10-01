jest.mock('../supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));

import { ApiError } from '../api';
import { LOCK_MESSAGE, mealLogErrorMessage } from './errors';

describe('mealLogErrorMessage', () => {
  it('explains the 24h lock on 403', () => {
    expect(mealLogErrorMessage(new ApiError(403, { message: 'x' }))).toBe(LOCK_MESSAGE);
  });

  // A API devolve o motivo (ex.: "Data inválida." para data no futuro); antes o
  // app trocava tudo por uma mensagem genérica e o paciente não sabia o porquê.
  it('shows the reason the API gives on 400', () => {
    expect(mealLogErrorMessage(new ApiError(400, { statusCode: 400, message: 'Data inválida.' }))).toBe(
      'Data inválida.',
    );
  });

  it('falls back to the generic message otherwise', () => {
    expect(mealLogErrorMessage(new ApiError(500, {}))).toBe('Não foi possível salvar. Tente novamente.');
    expect(mealLogErrorMessage(new ApiError(400, { message: ['a', 'b'] }))).toBe(
      'Não foi possível salvar. Tente novamente.',
    );
    expect(mealLogErrorMessage(new Error('network'))).toBe('Não foi possível salvar. Tente novamente.');
  });
});
