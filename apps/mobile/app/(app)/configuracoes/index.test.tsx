import { render, screen, fireEvent } from '@testing-library/react-native';

const mockSignOut = jest.fn();
jest.mock('../../../lib/auth', () => ({
  useSession: () => ({ session: { user: { email: 'ana@x.com' } }, signOut: mockSignOut }),
}));

import Configuracoes from './index';

beforeEach(() => mockSignOut.mockReset());

describe('Configuracoes screen', () => {
  it('shows the email and signs out on Sair', async () => {
    await render(<Configuracoes />);
    expect(screen.getByText('ana@x.com')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /sair/i }));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
