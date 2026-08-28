import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';

const generateMut = vi.fn();
const push = vi.fn();

vi.mock('@/lib/queries/meal-plans', () => ({
  useGenerateMealPlan: () => ({ mutateAsync: generateMut, isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const notifyChapterActionSucceeded = vi.fn(() => Promise.resolve());
const exit = vi.fn();
vi.mock('@/components/onboarding/tour-provider', () => ({
  useTour: () => ({
    start: vi.fn(),
    exit,
    skipChapter: vi.fn(),
    isPlayDemoSubmit: () => false,
    notifyChapterActionSucceeded,
  }),
}));

import { AiGenerateDialog } from './ai-generate-dialog';

const onOpenChange = vi.fn();

beforeEach(() => {
  generateMut.mockReset().mockResolvedValue({ jobId: 'j1' });
  push.mockReset();
  onOpenChange.mockReset();
  notifyChapterActionSucceeded.mockReset().mockResolvedValue(undefined);
  exit.mockReset();
});

describe('AiGenerateDialog', () => {
  it('generates with the typed instructions and closes the dialog without navigating', async () => {
    render(<AiGenerateDialog open onOpenChange={onOpenChange} patientId="p1" />);
    expect(screen.getByRole('button', { name: /gerar plano/i })).toHaveAttribute(
      'data-tour',
      'patients.plan.ai.confirm',
    );
    await userEvent.type(screen.getByLabelText(/instruções personalizadas/i), 'Apenas 4 refeições');
    await userEvent.click(screen.getByRole('button', { name: /gerar plano/i }));
    await waitFor(() => expect(generateMut).toHaveBeenCalledWith('Apenas 4 refeições'));
    expect(notifyChapterActionSucceeded).toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(push).not.toHaveBeenCalled();
  });

  it('still closes the dialog when the tour reports the generation was consumed', async () => {
    notifyChapterActionSucceeded.mockResolvedValue(true);
    render(<AiGenerateDialog open onOpenChange={onOpenChange} patientId="p1" />);
    await userEvent.click(screen.getByRole('button', { name: /gerar plano/i }));
    await waitFor(() => expect(generateMut).toHaveBeenCalled());
    expect(notifyChapterActionSucceeded).toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(push).not.toHaveBeenCalled();
  });

  it('generates with no instructions (undefined) when the field is empty', async () => {
    render(<AiGenerateDialog open onOpenChange={onOpenChange} patientId="p1" />);
    await userEvent.click(screen.getByRole('button', { name: /gerar plano/i }));
    await waitFor(() => expect(generateMut).toHaveBeenCalledWith(undefined));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(push).not.toHaveBeenCalled();
  });

  it('shows the missing-fields message on a 422 and keeps the dialog open', async () => {
    generateMut.mockRejectedValue(new ApiError(422, { message: 'Cannot generate a plan: missing height, objective' }));
    render(<AiGenerateDialog open onOpenChange={onOpenChange} patientId="p1" />);
    await userEvent.click(screen.getByRole('button', { name: /gerar plano/i }));
    expect(await screen.findByText(/altura/i)).toBeInTheDocument();
    expect(screen.getByText(/objetivo/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(push).not.toHaveBeenCalled();
    expect(notifyChapterActionSucceeded).not.toHaveBeenCalled();
  });

  it('exits the tour on 402 and does not notify success', async () => {
    generateMut.mockRejectedValue(new ApiError(402, { code: 'AI_QUOTA_EXCEEDED' }));
    render(<AiGenerateDialog open onOpenChange={onOpenChange} patientId="p1" />);
    await userEvent.click(screen.getByRole('button', { name: /gerar plano/i }));
    await waitFor(() => expect(exit).toHaveBeenCalled());
    expect(notifyChapterActionSucceeded).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('fecha o diálogo assim que dispara, sem esperar o plano', async () => {
    const onOpenChange = vi.fn();
    generateMut.mockResolvedValue({ jobId: 'j1' });

    render(<AiGenerateDialog open onOpenChange={onOpenChange} patientId="p1" />);
    await userEvent.click(screen.getByRole('button', { name: /gerar plano/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    // Não navega mais para o plano: ele ainda não existe.
    expect(push).not.toHaveBeenCalled();
  });
});
