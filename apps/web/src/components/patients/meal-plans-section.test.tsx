import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';

const useMealPlans = vi.fn();
const useAiJobsMock = vi.fn();
const generateMut = vi.fn();
const visibilityMutate = vi.fn();
const push = vi.fn();

vi.mock('@/lib/queries/meal-plans', () => ({
  useMealPlans: () => useMealPlans(),
  useGenerateMealPlan: () => ({ mutateAsync: generateMut, isPending: false }),
  useSetMealPlanVisibility: () => ({ mutate: visibilityMutate, isPending: false }),
}));
// Mock parcial: adjustmentInFlightFor é lógica pura, exercitada de verdade.
vi.mock('@/lib/queries/ai-jobs', async (orig) => ({
  ...(await orig<typeof import('@/lib/queries/ai-jobs')>()),
  useAiJobs: () => useAiJobsMock(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/queries/subscription', () => ({ useSubscription: () => ({ data: undefined }) }));

import { MealPlansSection } from './meal-plans-section';

function plan(over = {}) {
  return {
    id: 'm1', patientId: 'p1', title: 'Plano A', objective: 'Hipertrofia',
    aiGenerated: true, targetCalories: 1800, targetProtein: 135, targetCarbs: 180, targetFats: 60,
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', ...over,
  };
}

beforeEach(() => {
  useAiJobsMock.mockReset().mockReturnValue({ data: [], isLoading: false });
  useMealPlans.mockReset();
  generateMut.mockReset().mockResolvedValue(plan());
  visibilityMutate.mockReset();
  push.mockReset();
});

describe('MealPlansSection', () => {
  it('shows the empty state with CTAs when canEdit', () => {
    useMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<MealPlansSection patientId="p1" canEdit />);
    expect(screen.getByText(/nenhum plano ainda/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gerar com ia/i })).toHaveAttribute(
      'data-tour',
      'patients.plan.ai',
    );
    expect(screen.getByRole('link', { name: /novo plano/i })).toHaveAttribute(
      'data-tour',
      'patients.plan.new',
    );
  });

  it('hides CTAs for employees', () => {
    useMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [plan()] });
    render(<MealPlansSection patientId="p1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /gerar com ia/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /novo plano/i })).not.toBeInTheDocument();
  });

  it('lists plans with the AI badge', () => {
    useMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [plan()] });
    render(<MealPlansSection patientId="p1" canEdit />);
    expect(screen.getByText('Plano A')).toBeInTheDocument();
    expect(screen.getAllByText(/IA/).some((el) => el.tagName === 'SPAN')).toBe(true);
  });

  it('opens the AI dialog when "Gerar com IA" is clicked', async () => {
    useMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<MealPlansSection patientId="p1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /gerar com ia/i }));
    expect(await screen.findByLabelText(/instruções personalizadas/i)).toBeInTheDocument();
  });

  it('toggles a hidden plan to visible', async () => {
    useMealPlans.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [plan({ visibleToPatient: false })],
    });
    render(<MealPlansSection patientId="p1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /disponibilizar/i }));
    expect(visibilityMutate).toHaveBeenCalledWith({ id: 'm1', visibleToPatient: true });
  });

  it('marca o card do plano que está sendo ajustado, e só ele', () => {
    useMealPlans.mockReturnValue({
      data: [plan(), plan({ id: 'm2', title: 'Plano B' })],
      isLoading: false,
    });
    useAiJobsMock.mockReturnValue({
      data: [{
        id: 'j1', type: 'MEAL_PLAN_ADJUSTMENT', status: 'RUNNING',
        patientId: 'p1', patientName: 'Maria', mealPlanId: 'm2',
        error: null, createdAt: '2026-08-29T12:00:00.000Z',
        startedAt: '2026-08-29T12:00:00.000Z', finishedAt: null, isStuck: false,
      }],
      isLoading: false,
    });

    render(<MealPlansSection patientId="p1" canEdit />);

    expect(screen.getByTestId('plan-adjusting-m2')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-adjusting-m1')).not.toBeInTheDocument();
  });

  it('não marca nada quando o ajuste já terminou', () => {
    useMealPlans.mockReturnValue({ data: [plan()], isLoading: false });
    useAiJobsMock.mockReturnValue({
      data: [{
        id: 'j1', type: 'MEAL_PLAN_ADJUSTMENT', status: 'DONE',
        patientId: 'p1', patientName: 'Maria', mealPlanId: 'm1',
        error: null, createdAt: '2026-08-29T12:00:00.000Z',
        startedAt: null, finishedAt: '2026-08-29T12:01:00.000Z', isStuck: false,
      }],
      isLoading: false,
    });

    render(<MealPlansSection patientId="p1" canEdit />);
    expect(screen.queryByTestId('plan-adjusting-m1')).not.toBeInTheDocument();
  });
});
