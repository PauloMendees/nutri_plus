import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useNutritionistSettings = vi.fn();
const updateMut = vi.fn();
const uploadMut = vi.fn();
const deleteMut = vi.fn();

vi.mock('@/lib/queries/settings', () => ({
  useNutritionistSettings: () => useNutritionistSettings(),
  useUpdateNutritionistSettings: () => ({ mutateAsync: updateMut, isPending: false }),
  useUploadLogo: () => ({ mutateAsync: uploadMut, isPending: false }),
  useDeleteLogo: () => ({ mutateAsync: deleteMut, isPending: false }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SettingsView } from './settings-view';

beforeEach(() => {
  useNutritionistSettings.mockReset();
  updateMut.mockReset().mockResolvedValue({});
  uploadMut.mockReset().mockResolvedValue({});
  deleteMut.mockReset().mockResolvedValue({});
});

describe('SettingsView', () => {
  it('shows a loading state', () => {
    useNutritionistSettings.mockReturnValue({ isLoading: true });
    render(<SettingsView />);
    expect(screen.getByTestId('settings-loading')).toBeInTheDocument();
  });

  it('renders the two sections and prefills the form', () => {
    useNutritionistSettings.mockReturnValue({
      isLoading: false, isError: false,
      data: { displayName: 'Dra. Ana', logoUrl: null, mealPlanAiInstructions: 'Sem lactose' },
    });
    render(<SettingsView />);
    expect(screen.getByText(/plano alimentar/i)).toBeInTheDocument();
    expect(screen.getByText(/aparência/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nome de exibição/i)).toHaveValue('Dra. Ana');
    expect(screen.getByLabelText(/instruções padrão/i)).toHaveValue('Sem lactose');
  });

  it('saves the display name and instructions', async () => {
    useNutritionistSettings.mockReturnValue({
      isLoading: false, isError: false,
      data: { displayName: '', logoUrl: null, mealPlanAiInstructions: '' },
    });
    render(<SettingsView />);
    await userEvent.type(screen.getByLabelText(/nome de exibição/i), 'Dra. Ana');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
    expect(updateMut.mock.calls[0][0].displayName).toBe('Dra. Ana');
  });

  it('uploads a logo on file pick', async () => {
    useNutritionistSettings.mockReturnValue({
      isLoading: false, isError: false,
      data: { displayName: '', logoUrl: null, mealPlanAiInstructions: '' },
    });
    render(<SettingsView />);
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText(/logomarca/i), file);
    await waitFor(() => expect(uploadMut).toHaveBeenCalledTimes(1));
    expect(uploadMut.mock.calls[0][0]).toBe(file);
  });

  it('removes the logo when one exists', async () => {
    useNutritionistSettings.mockReturnValue({
      isLoading: false, isError: false,
      data: { displayName: '', logoUrl: 'https://cdn/n.png', mealPlanAiInstructions: '' },
    });
    render(<SettingsView />);
    await userEvent.click(screen.getByRole('button', { name: /remover logo/i }));
    await waitFor(() => expect(deleteMut).toHaveBeenCalledTimes(1));
  });
});
