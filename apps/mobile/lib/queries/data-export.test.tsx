const mockDownloadAsync = jest.fn();
const mockIsAvailable = jest.fn();
const mockShareAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: (...a: unknown[]) => mockDownloadAsync(...a),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailable(),
  shareAsync: (...a: unknown[]) => mockShareAsync(...a),
}));
jest.mock('../supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));

import { downloadMyData } from './data-export';

beforeEach(() => {
  mockDownloadAsync.mockReset().mockResolvedValue({ uri: 'file:///cache/meus-dados-inutri.json' });
  mockIsAvailable.mockReset().mockResolvedValue(true);
  mockShareAsync.mockReset().mockResolvedValue(undefined);
  process.env.EXPO_PUBLIC_API_URL = 'https://api.test';
});

describe('downloadMyData', () => {
  it('downloads the data export with the auth header and shares it', async () => {
    await downloadMyData();
    expect(mockDownloadAsync).toHaveBeenCalledWith(
      'https://api.test/v1/me/data-export',
      'file:///cache/meus-dados-inutri.json',
      { headers: { Authorization: 'Bearer tok' } },
    );
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///cache/meus-dados-inutri.json',
      { mimeType: 'application/json', UTI: 'public.json' },
    );
  });
});
