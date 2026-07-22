import { render, screen } from '@testing-library/react-native';

const mockRedirect = jest.fn();
const mockRefetch = jest.fn();
let mockSessionState: { session: unknown; loading: boolean } = { session: null, loading: false };
let mockConsentState: { isLoading: boolean; isError: boolean; data: unknown; refetch: jest.Mock } = {
  isLoading: false,
  isError: false,
  data: { needsConsent: false },
  refetch: mockRefetch,
};

jest.mock('expo-router', () => {
  const Tabs: any = ({ children }: { children: unknown }) => children;
  Tabs.Screen = () => null;
  return {
    Tabs,
    Redirect: ({ href }: { href: string }) => {
      mockRedirect(href);
      return null;
    },
  };
});
jest.mock('../../lib/auth', () => ({ useSession: () => mockSessionState }));
jest.mock('../../lib/theme', () => ({
  useTheme: () => ({ mode: 'system', setMode: jest.fn(), scheme: 'dark' }),
  getTabBarColors: () => ({ active: '#000', inactive: '#000', background: '#000', border: '#000' }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../lib/queries/consent', () => ({ useMyConsent: () => mockConsentState }));
jest.mock('../../components/consent/consent-gate', () => {
  const { Text } = require('react-native');
  return { ConsentGate: () => <Text testID="consent-gate-stub">consent gate</Text> };
});

import AppLayout from './_layout';

beforeEach(() => {
  mockRedirect.mockReset();
  mockRefetch.mockReset();
  mockSessionState = { session: null, loading: false };
  mockConsentState = { isLoading: false, isError: false, data: { needsConsent: false }, refetch: mockRefetch };
});

describe('(app) tab layout guard', () => {
  it('redirects to login when there is no session', async () => {
    await render(<AppLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(auth)/login');
  });

  it('renders the tabs (no redirect, no gate) when a session exists and consent is up to date', async () => {
    mockSessionState = { session: { user: {} }, loading: false };
    mockConsentState = { isLoading: false, isError: false, data: { needsConsent: false }, refetch: mockRefetch };
    await render(<AppLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.queryByTestId('consent-gate-stub')).toBeNull();
  });

  it('blocks with the ConsentGate when consent is pending, instead of the tabs', async () => {
    mockSessionState = { session: { user: {} }, loading: false };
    mockConsentState = {
      isLoading: false,
      isError: false,
      data: { needsConsent: true, currentVersion: '2026-07-09' },
      refetch: mockRefetch,
    };
    await render(<AppLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByTestId('consent-gate-stub')).toBeTruthy();
  });

  it('fails closed with an error state (no tabs, no gate) when consent status cannot be fetched', async () => {
    mockSessionState = { session: { user: {} }, loading: false };
    mockConsentState = { isLoading: false, isError: true, data: undefined, refetch: mockRefetch };
    await render(<AppLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText(/não foi possível verificar/i)).toBeTruthy();
    expect(screen.queryByTestId('consent-gate-stub')).toBeNull();
  });
});
