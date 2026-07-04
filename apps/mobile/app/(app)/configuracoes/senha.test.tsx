import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockSignIn = jest.fn();
const mockUpdateUser = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (a: unknown) => mockSignIn(a),
      updateUser: (a: unknown) => mockUpdateUser(a),
    },
  },
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), push: jest.fn() },
}));

jest.mock('../../../lib/auth', () => ({
  useSession: () => ({ session: { user: { email: 'a@x.com' } }, signOut: jest.fn() }),
}));

import AlterarSenha from './senha';

beforeEach(() => {
  mockSignIn.mockReset().mockResolvedValue({ error: null });
  mockUpdateUser.mockReset().mockResolvedValue({ error: null });
  mockBack.mockReset();
});

async function fillValid() {
  await fireEvent.changeText(screen.getByLabelText('Senha atual'), 'old12345');
  await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'new12345');
  await fireEvent.changeText(screen.getByLabelText('Confirmar nova senha'), 'new12345');
}

describe('Change password screen', () => {
  it('renders the three fields', async () => {
    await render(<AlterarSenha />);
    expect(screen.getByLabelText('Senha atual')).toBeTruthy();
    expect(screen.getByLabelText('Nova senha')).toBeTruthy();
    expect(screen.getByLabelText('Confirmar nova senha')).toBeTruthy();
  });

  it('re-authenticates then updates the password and goes back', async () => {
    await render(<AlterarSenha />);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: /salvar nova senha/i }));
    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith({ email: 'a@x.com', password: 'old12345' }),
    );
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'new12345' }));
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows an error and does not update when the current password is wrong', async () => {
    mockSignIn.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'invalid' } });
    await render(<AlterarSenha />);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: /salvar nova senha/i }));
    expect(await screen.findByText('Senha atual incorreta.')).toBeTruthy();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows the zod message for non-matching passwords and calls no supabase', async () => {
    await render(<AlterarSenha />);
    await fireEvent.changeText(screen.getByLabelText('Senha atual'), 'old12345');
    await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'new12345');
    await fireEvent.changeText(screen.getByLabelText('Confirmar nova senha'), 'other12345');
    await fireEvent.press(screen.getByRole('button', { name: /salvar nova senha/i }));
    expect(await screen.findByText('As senhas não coincidem.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('maps a weak-password rejection from updateUser and stays', async () => {
    mockUpdateUser.mockResolvedValue({ error: { code: 'weak_password', message: 'weak' } });
    await render(<AlterarSenha />);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: /salvar nova senha/i }));
    expect(await screen.findByText('A senha é muito fraca. Use ao menos 8 caracteres.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
