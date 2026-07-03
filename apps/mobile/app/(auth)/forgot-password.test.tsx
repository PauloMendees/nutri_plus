import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockResetPasswordForEmail = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: (e: unknown) => mockResetPasswordForEmail(e) } },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (h: unknown) => mockPush(h), replace: jest.fn() },
}));

import ForgotPassword from './forgot-password';

beforeEach(() => {
  mockResetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  mockPush.mockReset();
});

describe('Forgot password screen', () => {
  it('shows a validation message for an invalid email and calls no supabase', async () => {
    await render(<ForgotPassword />);
    await fireEvent.press(screen.getByRole('button', { name: /enviar código/i }));
    expect(await screen.findByText('Informe um e-mail válido.')).toBeTruthy();
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('sends the code and navigates to reset with the email', async () => {
    await render(<ForgotPassword />);
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'a@x.com');
    await fireEvent.press(screen.getByRole('button', { name: /enviar código/i }));
    await waitFor(() => expect(mockResetPasswordForEmail).toHaveBeenCalledWith('a@x.com'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reset-password', params: { email: 'a@x.com' } });
  });
});
