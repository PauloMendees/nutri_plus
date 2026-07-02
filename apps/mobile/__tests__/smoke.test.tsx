import { render, screen } from '@testing-library/react-native';

jest.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: jest.fn() } },
}));

import Login from '../app/(auth)/login';

describe('scaffold smoke', () => {
  it('renders the login screen', async () => {
    await render(<Login />);
    expect(screen.getByText('iNutri')).toBeTruthy();
  });
});
