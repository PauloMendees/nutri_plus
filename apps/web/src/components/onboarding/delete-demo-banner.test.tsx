import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mutateAsync = vi.fn();
vi.mock('@/lib/queries/patients', () => ({
  useDeleteDemoPatient: () => ({ mutateAsync, isPending: false }),
}));

import { DeleteDemoBanner } from './delete-demo-banner';

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue(undefined);
});

describe('DeleteDemoBanner', () => {
  it('renders button; click confirm calls delete with the id', async () => {
    render(<DeleteDemoBanner patientId="demo-1" />);
    expect(screen.getByText('Este é um paciente de demonstração.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apagar paciente de demonstração' }));
    expect(mutateAsync).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    expect(mutateAsync).toHaveBeenCalledWith('demo-1');
  });
});
