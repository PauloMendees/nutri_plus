import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockVerifyOtp = jest.fn();
const mockUpdateUser = jest.fn();
const mockResetPasswordForEmail = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (a: unknown) => mockVerifyOtp(a),
      updateUser: (a: unknown) => mockUpdateUser(a),
      resetPasswordForEmail: (a: unknown) => mockResetPasswordForEmail(a),
    },
  },
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (h: unknown) => mockReplace(h), push: jest.fn() },
  useLocalSearchParams: () => ({ email: 'a@x.com' }),
}));

import ResetPassword from './reset-password';

beforeEach(() => {
  mockVerifyOtp.mockReset().mockResolvedValue({ error: null });
  mockUpdateUser.mockReset().mockResolvedValue({ error: null });
  mockResetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  mockReplace.mockReset();
});

async function fillValid() {
  await fireEvent.changeText(screen.getByLabelText('Código'), '123456');
  await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'password1');
  await fireEvent.changeText(screen.getByLabelText('Confirmar senha'), 'password1');
}

describe('Reset password screen', () => {
  it('renders the code and password fields', async () => {
    await render(<ResetPassword />);
    expect(screen.getByLabelText('Código')).toBeTruthy();
    expect(screen.getByLabelText('Nova senha')).toBeTruthy();
    expect(screen.getByLabelText('Confirmar senha')).toBeTruthy();
  });

  it('verifies the code, updates the password, and enters the app', async () => {
    await render(<ResetPassword />);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: /salvar e entrar/i }));
    await waitFor(() =>
      expect(mockVerifyOtp).toHaveBeenCalledWith({ email: 'a@x.com', token: '123456', type: 'recovery' }),
    );
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'password1' }));
    expect(mockReplace).toHaveBeenCalledWith('/(app)');
  });

  it('shows an error and does not update the password when the code is invalid', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { code: 'otp_expired', message: 'Token has expired or is invalid' } });
    await render(<ResetPassword />);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: /salvar e entrar/i }));
    expect(await screen.findByText('Código inválido ou expirado. Peça um novo.')).toBeTruthy();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows the zod message for non-matching passwords and calls no supabase', async () => {
    await render(<ResetPassword />);
    await fireEvent.changeText(screen.getByLabelText('Código'), '123456');
    await fireEvent.changeText(screen.getByLabelText('Nova senha'), 'password1');
    await fireEvent.changeText(screen.getByLabelText('Confirmar senha'), 'password2');
    await fireEvent.press(screen.getByRole('button', { name: /salvar e entrar/i }));
    expect(await screen.findByText('As senhas não coincidem.')).toBeTruthy();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('shows the weak-password message when updateUser rejects it and stays', async () => {
    mockUpdateUser.mockResolvedValue({ error: { code: 'weak_password', message: 'weak' } });
    await render(<ResetPassword />);
    await fillValid();
    await fireEvent.press(screen.getByRole('button', { name: /salvar e entrar/i }));
    expect(await screen.findByText('A senha é muito fraca. Use ao menos 8 caracteres.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('resends the code when tapped', async () => {
    await render(<ResetPassword />);
    await fireEvent.press(screen.getByText('Reenviar código'));
    await waitFor(() => expect(mockResetPasswordForEmail).toHaveBeenCalledWith('a@x.com'));
  });
});
