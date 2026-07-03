import { render } from '@testing-library/react-native';

const mockRedirect = jest.fn();
let mockSegments: string[] = [];
let mockSessionState: { session: unknown; loading: boolean } = { session: null, loading: false };

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
  Stack: () => null,
  useSegments: () => mockSegments,
}));
jest.mock('../../lib/auth', () => ({
  useSession: () => mockSessionState,
}));

import AuthLayout from './_layout';

beforeEach(() => {
  mockRedirect.mockReset();
  mockSegments = ['(auth)', 'login'];
  mockSessionState = { session: null, loading: false };
});

describe('(auth) layout guard', () => {
  it('redirects to (app) when a session exists off the reset screen', async () => {
    mockSessionState = { session: { user: {} }, loading: false };
    mockSegments = ['(auth)', 'login'];
    await render(<AuthLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(app)');
  });

  it('does NOT redirect while on reset-password even with a session', async () => {
    mockSessionState = { session: { user: {} }, loading: false };
    mockSegments = ['(auth)', 'reset-password'];
    await render(<AuthLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('does not redirect when there is no session', async () => {
    await render(<AuthLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
