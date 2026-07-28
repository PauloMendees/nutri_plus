import { registerForPush, unregisterPush } from './push';

const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockGetToken = jest.fn();
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: () => mockGetPermissions(),
  requestPermissionsAsync: () => mockRequestPermissions(),
  getExpoPushTokenAsync: (opts: unknown) => mockGetToken(opts),
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { eas: { projectId: 'proj-1' } } } }));
const mockApiFetch = jest.fn();
jest.mock('./api', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

beforeEach(() => {
  mockGetPermissions.mockReset();
  mockRequestPermissions.mockReset();
  mockGetToken.mockReset();
  mockApiFetch.mockReset().mockResolvedValue(undefined);
});

describe('registerForPush', () => {
  it('registers the Expo token when permission is granted', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    mockGetToken.mockResolvedValue({ data: 'ExpoTok' });
    const result = await registerForPush();
    expect(mockGetToken).toHaveBeenCalledWith({ projectId: 'proj-1' });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/me/push-tokens',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(result).toEqual({ token: 'ExpoTok' });
  });

  it('returns denied and registers nothing when permission is refused', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });
    const result = await registerForPush();
    expect(result).toEqual({ denied: true });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('unregisterPush', () => {
  it('deletes the token', async () => {
    await unregisterPush('ExpoTok');
    expect(mockApiFetch).toHaveBeenCalledWith('/me/push-tokens/ExpoTok', { method: 'DELETE' });
  });
});
