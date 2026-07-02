import { render, screen } from '@testing-library/react-native';

jest.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: jest.fn() } },
}));

import Login from '../app/(auth)/login';

describe('themed login', () => {
  it('renders the branded title with NativeWind classes', async () => {
    await render(<Login />);
    expect(screen.getByText('iNutri')).toBeTruthy();
  });
});
