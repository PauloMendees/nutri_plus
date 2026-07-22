import { render, screen, fireEvent } from '@testing-library/react-native';

const mockMutate = jest.fn();
const mockSignOut = jest.fn();
jest.mock('../../lib/queries/consent', () => ({
  useAcceptConsent: () => ({ mutate: mockMutate, isPending: false, isError: false }),
}));
jest.mock('../../lib/auth', () => ({ useSession: () => ({ signOut: mockSignOut }) }));

import { ConsentGate } from './consent-gate';

beforeEach(() => { mockMutate.mockReset(); mockSignOut.mockReset(); });

describe('ConsentGate', () => {
  it('só habilita "Aceitar" depois de marcar o checkbox, e envia a versão atual', async () => {
    await render(<ConsentGate currentVersion="2026-07-09" />);
    const accept = screen.getByRole('button', { name: /aceitar e continuar/i });
    await fireEvent.press(accept);
    expect(mockMutate).not.toHaveBeenCalled(); // desabilitado sem o checkbox
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(accept);
    expect(mockMutate).toHaveBeenCalledWith('2026-07-09');
  });

  it('"Recusar" faz logout', async () => {
    await render(<ConsentGate currentVersion="2026-07-09" />);
    await fireEvent.press(screen.getByRole('button', { name: /recusar/i }));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
