import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockSignOut = jest.fn();
jest.mock('../../../lib/auth', () => ({
  useSession: () => ({ session: { user: { email: 'a@x.com' } }, signOut: mockSignOut }),
}));

const mockSetMode = jest.fn();
let mockMode = 'system';
jest.mock('../../../lib/theme', () => ({
  useTheme: () => ({ mode: mockMode, setMode: mockSetMode, scheme: 'dark' }),
  useThemeColor: () => 'rgb(0, 0, 0)',
}));

let mockNutritionist: { isLoading: boolean; data: unknown };
jest.mock('../../../lib/queries/nutritionist', () => ({
  useMyNutritionist: () => mockNutritionist,
}));

const mockApiFetch = jest.fn();
jest.mock('../../../lib/api', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const mockDownloadMyData = jest.fn();
jest.mock('../../../lib/queries/data-export', () => ({
  downloadMyData: (...a: unknown[]) => mockDownloadMyData(...a),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (h: unknown) => mockPush(h), back: jest.fn() } }));

const mockRegisterForPush = jest.fn();
const mockUnregisterPush = jest.fn();
jest.mock('../../../lib/push', () => ({
  registerForPush: (...a: unknown[]) => mockRegisterForPush(...a),
  unregisterPush: (...a: unknown[]) => mockUnregisterPush(...a),
}));

const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...a: unknown[]) => mockGetItemAsync(...a),
  setItemAsync: (...a: unknown[]) => mockSetItemAsync(...a),
  deleteItemAsync: (...a: unknown[]) => mockDeleteItemAsync(...a),
}));

import ConfiguracoesIndex from './index';

beforeEach(() => {
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockSetMode.mockReset();
  mockMode = 'system';
  mockApiFetch.mockReset().mockResolvedValue(null);
  mockDownloadMyData.mockReset().mockResolvedValue(undefined);
  mockPush.mockReset();
  mockRegisterForPush.mockReset();
  mockUnregisterPush.mockReset().mockResolvedValue(undefined);
  mockGetItemAsync.mockReset().mockResolvedValue(null);
  mockSetItemAsync.mockReset().mockResolvedValue(undefined);
  mockDeleteItemAsync.mockReset().mockResolvedValue(undefined);
  mockNutritionist = {
    isLoading: false,
    data: { name: 'Beatriz', displayName: 'Dra. Bia', email: 'bia@x.com', crn: 'CRN-123', logoUrl: null },
  };
});

describe('Configurações index', () => {
  it('shows the nutritionist display name, email, and CRN', async () => {
    await render(<ConfiguracoesIndex />);
    expect(screen.getByText('Dra. Bia')).toBeTruthy();
    expect(screen.getByText('bia@x.com')).toBeTruthy();
    expect(screen.getByText('CRN CRN-123')).toBeTruthy();
  });

  it('shows an empty state when there is no nutritionist', async () => {
    mockNutritionist = { isLoading: false, data: null };
    await render(<ConfiguracoesIndex />);
    expect(screen.getByText('Nenhum nutricionista vinculado.')).toBeTruthy();
  });

  it('navigates to the change-password screen', async () => {
    await render(<ConfiguracoesIndex />);
    await fireEvent.press(screen.getByText('Alterar senha'));
    expect(mockPush).toHaveBeenCalledWith('/configuracoes/senha');
  });

  it('sets the theme when an option is tapped', async () => {
    await render(<ConfiguracoesIndex />);
    await fireEvent.press(screen.getByText('Claro'));
    expect(mockSetMode).toHaveBeenCalledWith('light');
  });

  it('logs out', async () => {
    await render(<ConfiguracoesIndex />);
    await fireEvent.press(screen.getByText('Sair'));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('exports my data', async () => {
    await render(<ConfiguracoesIndex />);
    await fireEvent.press(screen.getByText('Exportar meus dados'));

    await waitFor(() => expect(mockDownloadMyData).toHaveBeenCalled());
    expect(await screen.findByText('Exportar meus dados')).toBeTruthy();
  });

  it('shows an error when the export fails', async () => {
    mockDownloadMyData.mockRejectedValue(new Error('boom'));
    await render(<ConfiguracoesIndex />);
    await fireEvent.press(screen.getByText('Exportar meus dados'));

    expect(await screen.findByText('Não foi possível exportar seus dados. Tente novamente.')).toBeTruthy();
  });

  it('confirms, deletes the account, and signs out', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<ConfiguracoesIndex />);
    await fireEvent.press(screen.getByText('Apagar minha conta'));

    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const apagar = buttons.find((b) => b.text === 'Apagar');
    await apagar?.onPress?.();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/me', { method: 'DELETE' }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    alertSpy.mockRestore();
  });

  it('registers for push when the reminders toggle is turned on', async () => {
    mockRegisterForPush.mockResolvedValue({ token: 'ExpoTok' });
    await render(<ConfiguracoesIndex />);

    const toggle = screen.getByLabelText('Lembretes de consulta');
    await fireEvent(toggle, 'valueChange', true);

    await waitFor(() => expect(mockRegisterForPush).toHaveBeenCalled());
    await waitFor(() => expect(mockSetItemAsync).toHaveBeenCalledWith('push-token', 'ExpoTok'));
  });

  it('stays off and alerts when push permission is denied', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRegisterForPush.mockResolvedValue({ denied: true });
    await render(<ConfiguracoesIndex />);

    const toggle = screen.getByLabelText('Lembretes de consulta');
    await fireEvent(toggle, 'valueChange', true);

    await waitFor(() => expect(mockRegisterForPush).toHaveBeenCalled());
    expect(alertSpy).toHaveBeenCalledWith(
      'Permissão negada',
      'Ative as notificações nas configurações do sistema para receber lembretes.',
    );
    expect(mockSetItemAsync).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('unregisters the stored token when the reminders toggle is turned off', async () => {
    mockGetItemAsync.mockResolvedValue('StoredTok');
    await render(<ConfiguracoesIndex />);

    const toggle = await screen.findByLabelText('Lembretes de consulta');
    await waitFor(() => expect(mockGetItemAsync).toHaveBeenCalledWith('push-token'));
    await fireEvent(toggle, 'valueChange', false);

    await waitFor(() => expect(mockUnregisterPush).toHaveBeenCalledWith('StoredTok'));
    await waitFor(() => expect(mockDeleteItemAsync).toHaveBeenCalledWith('push-token'));
  });
});
