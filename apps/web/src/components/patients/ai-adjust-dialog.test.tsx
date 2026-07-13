import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const adjustMut = vi.fn();
vi.mock('@/lib/queries/meal-plans', () => ({
  useAdjustMealPlan: () => ({ mutateAsync: adjustMut, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { AiAdjustDialog } from './ai-adjust-dialog';

beforeEach(() => adjustMut.mockReset());

describe('AiAdjustDialog', () => {
  it('sends the instructions and calls onApplied with the returned draft', async () => {
    const draft = { title: 'Plano', meals: [] };
    adjustMut.mockResolvedValue(draft);
    const onApplied = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<AiAdjustDialog open onOpenChange={onOpenChange} planId="m1" onApplied={onApplied} />);

    await user.type(screen.getByLabelText(/o que ajustar/i), 'menos carboidrato no jantar');
    await user.click(screen.getByRole('button', { name: /ajustar plano/i }));

    expect(adjustMut).toHaveBeenCalledWith('menos carboidrato no jantar');
    expect(onApplied).toHaveBeenCalledWith(draft);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables submit until instructions are entered', () => {
    render(<AiAdjustDialog open onOpenChange={vi.fn()} planId="m1" onApplied={vi.fn()} />);
    expect(screen.getByRole('button', { name: /ajustar plano/i })).toBeDisabled();
  });
});
