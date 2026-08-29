import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

const adjustMut = vi.fn();
vi.mock('@/lib/queries/meal-plans', () => ({
  useAdjustMealPlan: () => ({ mutateAsync: adjustMut, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AiAdjustDialog } from './ai-adjust-dialog';

beforeEach(() => adjustMut.mockReset());

describe('AiAdjustDialog', () => {
  it('sends the instructions, closes the dialog and does not wait for the plan', async () => {
    adjustMut.mockResolvedValue({ jobId: 'j1' });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<AiAdjustDialog open onOpenChange={onOpenChange} planId="m1" patientId="p1" />);

    await user.type(screen.getByLabelText(/o que ajustar/i), 'menos carboidrato no jantar');
    await user.click(screen.getByRole('button', { name: /ajustar plano/i }));

    expect(adjustMut).toHaveBeenCalledWith('menos carboidrato no jantar');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // A copy não promete um aviso que não existe: acompanhar é manual, no painel.
    expect(toast.success).toHaveBeenCalledWith('Ajustando o plano em segundo plano. Acompanhe em Processos de IA.');
  });

  it('disables submit until instructions are entered', () => {
    render(<AiAdjustDialog open onOpenChange={vi.fn()} planId="m1" patientId="p1" />);
    expect(screen.getByRole('button', { name: /ajustar plano/i })).toBeDisabled();
  });
});
