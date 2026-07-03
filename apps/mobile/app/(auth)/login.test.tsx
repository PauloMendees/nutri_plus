import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockSignInWithPassword = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: (a: unknown) => mockSignInWithPassword(a) } },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (h: unknown) => mockPush(h), replace: jest.fn() },
}));

import Login from './login';

beforeEach(() => {
  mockSignInWithPassword.mockReset().mockResolvedValue({ error: null });
  mockPush.mockReset();
});

describe('Login screen', () => {
  it('shows validation messages for empty/invalid input', async () => {
    await render(<Login />);
    await fireEvent.press(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByText('Informe um e-mail válido.')).toBeTruthy();
    expect(screen.getByText('Informe sua senha.')).toBeTruthy();
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with valid credentials', async () => {
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'a@x.com');
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'secret');
    await fireEvent.press(screen.getByRole('button', { name: /entrar/i }));
    await waitFor(() =>
      expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'a@x.com', password: 'secret' }),
    );
  });

  it('shows a friendly error when sign-in fails', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'a@x.com');
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'wrong');
    await fireEvent.press(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeTruthy();
  });

  it('navigates to forgot-password from the link', async () => {
    await render(<Login />);
    await fireEvent.press(screen.getByText('Esqueci minha senha'));
    expect(mockPush).toHaveBeenCalledWith('/forgot-password');
  });
});
