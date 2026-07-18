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

  it('renders the three tabs and prefills the form', () => {
    useNutritionistSettings.mockReturnValue({
      isLoading: false, isError: false,
      data: {
        displayName: 'Dra. Ana', logoUrl: null, mealPlanAiInstructions: 'Sem lactose',
        defaultCanLogAssessments: false, defaultShowMealTargetToPatient: false,
      },
    });
    render(<SettingsView />);
    expect(screen.getByRole('tab', { name: /plano alimentar/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /aparência/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /aplicativo paciente/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/nome de exibição/i)).toHaveValue('Dra. Ana');
    expect(screen.getByLabelText(/instruções padrão/i)).toHaveValue('Sem lactose');
  });

  it('saves the display name and instructions', async () => {
    useNutritionistSettings.mockReturnValue({
      isLoading: false, isError: false,
      data: {
        displayName: '', logoUrl: null, mealPlanAiInstructions: '',
        defaultCanLogAssessments: false, defaultShowMealTargetToPatient: false,
      },
    });
    render(<SettingsView />);
    await userEvent.type(screen.getByLabelText(/nome de exibição/i), 'Dra. Ana');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
    expect(updateMut.mock.calls[0][0].displayName).toBe('Dra. Ana');
  });

  it('uploads a logo on file pick', async () => {
    useNutritionistSettings.mockReturnValue({
      isLoading: false, isError: false,
      data: {
        displayName: '', logoUrl: null, mealPlanAiInstructions: '',
        defaultCanLogAssessments: false, defaultShowMealTargetToPatient: false,
      },
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
      data: {
        displayName: '', logoUrl: 'https://cdn/n.png', mealPlanAiInstructions: '',
        defaultCanLogAssessments: false, defaultShowMealTargetToPatient: false,
      },
    });
    render(<SettingsView />);
    await userEvent.click(screen.getByRole('button', { name: /remover logo/i }));
    await waitFor(() => expect(deleteMut).toHaveBeenCalledTimes(1));
  });

  describe('Aplicativo Paciente tab', () => {
    function setData(over: Record<string, unknown> = {}) {
      useNutritionistSettings.mockReturnValue({
        isLoading: false, isError: false,
        data: {
          displayName: '', logoUrl: null, mealPlanAiInstructions: '',
          defaultCanLogAssessments: false, defaultShowMealTargetToPatient: false,
          ...over,
        },
      });
    }

    it('shows the explanatory text and the two toggles', async () => {
      setData();
      render(<SettingsView />);
      await userEvent.click(screen.getByRole('tab', { name: /aplicativo paciente/i }));
      expect(
        screen.getByText(/configurações padrão aplicadas a novos pacientes/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/permitir registrar bioimpedância/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/mostrar a meta nutricional no app/i),
      ).toBeInTheDocument();
    });

    it('toggles both defaults and saves them in the update body', async () => {
      setData();
      render(<SettingsView />);
      await userEvent.click(screen.getByRole('tab', { name: /aplicativo paciente/i }));

      const toggles = screen.getAllByRole('button', { name: /desligado/i });
      expect(toggles).toHaveLength(2);
      await userEvent.click(toggles[0]);
      await userEvent.click(toggles[1]);

      await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

      await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
      expect(updateMut.mock.calls[0][0]).toMatchObject({
        defaultCanLogAssessments: true,
        defaultShowMealTargetToPatient: true,
      });
    });
  });
});
