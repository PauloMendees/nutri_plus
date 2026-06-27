import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';

const useMealPlans = vi.fn();
const generateMut = vi.fn();
const push = vi.fn();

vi.mock('@/lib/queries/meal-plans', () => ({
  useMealPlans: () => useMealPlans(),
  useGenerateMealPlan: () => ({ mutateAsync: generateMut, isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { MealPlansSection } from './meal-plans-section';
import { missingFieldsFromError } from '@/lib/meal-plans/generate-error';

function plan(over = {}) {
  return {
    id: 'm1', patientId: 'p1', title: 'Plano A', objective: 'Hipertrofia',
    aiGenerated: true, targetCalories: 1800, targetProtein: 135, targetCarbs: 180, targetFats: 60,
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', ...over,
  };
}

beforeEach(() => {
  useMealPlans.mockReset();
  generateMut.mockReset().mockResolvedValue(plan());
  push.mockReset();
});

describe('missingFieldsFromError', () => {
  it('maps 422 tokens to pt-BR labels', () => {
    const err = new ApiError(422, { message: 'Cannot generate a plan: missing height, gender, objective' });
    expect(missingFieldsFromError(err)).toEqual(['altura', 'gênero', 'objetivo']);
  });
  it('returns null for non-422', () => {
    expect(missingFieldsFromError(new ApiError(500, {}))).toBeNull();
  });
});

describe('MealPlansSection', () => {
  it('shows the empty state with CTAs when canEdit', () => {
    useMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<MealPlansSection patientId="p1" canEdit />);
    expect(screen.getByText(/nenhum plano ainda/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gerar com ia/i })).toBeInTheDocument();
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

  it('generates and navigates to the new plan', async () => {
    useMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<MealPlansSection patientId="p1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /gerar com ia/i }));
    await waitFor(() => expect(generateMut).toHaveBeenCalledWith(undefined));
    expect(push).toHaveBeenCalledWith('/patients/p1/planos/m1');
  });

  it('shows the missing-fields message on a 422', async () => {
    useMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [] });
    generateMut.mockRejectedValue(new ApiError(422, { message: 'Cannot generate a plan: missing height, objective' }));
    render(<MealPlansSection patientId="p1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /gerar com ia/i }));
    expect(await screen.findByText(/altura/i)).toBeInTheDocument();
    expect(screen.getByText(/objetivo/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
