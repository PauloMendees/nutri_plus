import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

const mockSignOut = jest.fn();
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
jest.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => mockGetSession(...a),
      onAuthStateChange: (...a: unknown[]) => mockOnAuthStateChange(...a),
      signOut: (...a: unknown[]) => mockSignOut(...a),
    },
  },
}));

const mockUnregisterPush = jest.fn();
jest.mock('./push', () => ({
  unregisterPush: (...a: unknown[]) => mockUnregisterPush(...a),
}));

const mockGetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...a: unknown[]) => mockGetItemAsync(...a),
  deleteItemAsync: (...a: unknown[]) => mockDeleteItemAsync(...a),
}));

import { AuthProvider, useSession } from './auth';

function SignOutButton() {
  const { signOut } = useSession();
  return (
    <Pressable accessibilityRole="button" onPress={signOut}>
      <Text>Sair</Text>
    </Pressable>
  );
}

beforeEach(() => {
  mockSignOut.mockReset().mockResolvedValue({ error: null });
  mockGetSession.mockReset().mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange
    .mockReset()
    .mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
  mockUnregisterPush.mockReset().mockResolvedValue(undefined);
  mockGetItemAsync.mockReset().mockResolvedValue(null);
  mockDeleteItemAsync.mockReset().mockResolvedValue(undefined);
});

describe('signOut', () => {
  it('unregisters and clears the stored push token before signing out', async () => {
    mockGetItemAsync.mockResolvedValue('ExpoTok');
    await render(
      <AuthProvider>
        <SignOutButton />
      </AuthProvider>,
    );
    await fireEvent.press(screen.getByText('Sair'));

    await waitFor(() => expect(mockUnregisterPush).toHaveBeenCalledWith('ExpoTok'));
    await waitFor(() => expect(mockDeleteItemAsync).toHaveBeenCalledWith('push-token'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it('signs out normally when there is no stored push token', async () => {
    await render(
      <AuthProvider>
        <SignOutButton />
      </AuthProvider>,
    );
    await fireEvent.press(screen.getByText('Sair'));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockUnregisterPush).not.toHaveBeenCalled();
    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });
});
