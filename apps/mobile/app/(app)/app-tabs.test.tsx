import { render } from '@testing-library/react-native';

const mockRedirect = jest.fn();
let mockSessionState: { session: unknown; loading: boolean } = { session: null, loading: false };

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
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import AppLayout from './_layout';

beforeEach(() => {
  mockRedirect.mockReset();
  mockSessionState = { session: null, loading: false };
});

describe('(app) tab layout guard', () => {
  it('redirects to login when there is no session', async () => {
    await render(<AppLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(auth)/login');
  });

  it('renders the tabs (no redirect) when a session exists', async () => {
    mockSessionState = { session: { user: {} }, loading: false };
    await render(<AppLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
