import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSyncExternalStore } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';

const usePatient = vi.fn();
const mutateAsync = vi.fn();
const inviteMut = vi.fn();
const uploadPhotoMut = vi.fn();
const deletePhotoMut = vi.fn();
let uploadPhotoPending = false;

vi.mock('@/lib/queries/patients', () => ({
  usePatient: (id: string) => usePatient(id),
  useUpdatePatient: () => ({ mutateAsync, isPending: false }),
  useInvitePatient: () => ({ mutateAsync: inviteMut, isPending: false }),
  useUploadPatientPhoto: () => ({ mutateAsync: uploadPhotoMut, isPending: uploadPhotoPending }),
  useDeletePatientPhoto: () => ({ mutateAsync: deletePhotoMut, isPending: false }),
}));
const useAssessments = vi.fn();
vi.mock('@/lib/queries/assessments', () => ({
  useAssessments: (...args: unknown[]) => useAssessments(...args),
  useCreateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/api/assessments', () => ({
  downloadAssessmentsPdf: vi.fn(),
}));
vi.mock('@/lib/queries/meal-plans', () => ({
  useMealPlans: () => ({ data: [], isLoading: false, isError: false }),
  useGenerateMealPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetMealPlanVisibility: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Mock parcial: adjustmentInFlightFor é lógica pura, exercitada de verdade.
vi.mock('@/lib/queries/ai-jobs', async (orig) => ({
  ...(await orig<typeof import('@/lib/queries/ai-jobs')>()),
  useAiJobs: () => ({ data: [], isLoading: false }),
  useRetryAiJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/queries/meal-logs', () => ({
  usePatientMealLogs: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/lib/queries/silhueta', () => ({
  useCreateSilhuetaScan: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/queries/nutrition-targets', () => ({
  useNutritionTargets: () => ({ data: [], isLoading: false }),
  useCreateNutritionTarget: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
const push = vi.fn();
const replace = vi.fn();
// Fake router: `replace` de verdade "navega" (atualiza os search params e
// notifica quem está inscrito), igual ao App Router faria — sem isso, clicar
// numa aba não re-renderiza o componente e o conteúdo da aba nunca aparece,
// já que a aba passou a ser derivada só de searchParams (sem useState local).
let currentSearchParams = new URLSearchParams();
const searchParamsListeners = new Set<() => void>();
replace.mockImplementation((url: string) => {
  const qIndex = url.indexOf('?');
  currentSearchParams = new URLSearchParams(qIndex >= 0 ? url.slice(qIndex + 1) : '');
  searchParamsListeners.forEach((listener) => listener());
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/patients/p1',
  useSearchParams: () =>
    useSyncExternalStore(
      (listener) => {
        searchParamsListeners.add(listener);
        return () => searchParamsListeners.delete(listener);
      },
      () => currentSearchParams,
      () => currentSearchParams,
    ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/queries/subscription', () => ({
  useSubscription: () => ({ data: { entitlements: { features: { silhueta: true } } } }),
}));

import { PatientDetail } from './patient-detail';

const patient = {
  id: 'p1',
  name: 'Maria Silva',
  email: 'maria@x.com',
  phone: '5511999998888',
  inviteStatus: 'NOT_INVITED',
  user: null,
  birthDate: '1991-03-14T00:00:00.000Z',
  gender: 'FEMALE',
  height: 165,
  imc: 24.2,
  targetWeight: 62,
  objective: 'WEIGHT_LOSS',
  activityLevel: 'MODERATE',
  restrictions: null,
  allergies: null,
  medicalConditions: null,
  notes: null,
  nutritionistId: 'n1',
  canLogAssessments: false,
  showMealTargetToPatient: false,
  photoUrl: 'https://example.com/photo.jpg',
  isDemo: false,
  createdAt: '2026-05-12T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  assessments: [],
  latestConsent: null,
};

beforeEach(() => {
  usePatient.mockReset();
  mutateAsync.mockReset();
  inviteMut.mockReset();
  uploadPhotoMut.mockReset();
  deletePhotoMut.mockReset();
  uploadPhotoPending = false;
  useAssessments.mockReset().mockReturnValue({ data: [], isLoading: false, isError: false });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  push.mockReset();
  // mockClear, não mockReset: reset apagaria a implementação que faz o
  // `replace` de fato "navegar" (atualizar os search params), e a partir do
  // segundo teste clicar numa aba deixaria de trocar de aba.
  replace.mockClear();
  currentSearchParams = new URLSearchParams();
});

describe('PatientDetail', () => {
  it('shows a not-found state on 404', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: true, error: new ApiError(404, {}) });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByText(/não encontrado/i)).toBeInTheDocument();
  });

  it('renders the persistent header and the three section tabs', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('maria@x.com')).toBeInTheDocument();
    expect(screen.getByText('Sem convite')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/5511999998888',
    );
    expect(document.querySelector('[data-tour="patients.detail.header"]')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /dados/i })).toHaveAttribute('data-tour', 'patients.tab.dados');
    expect(screen.getByRole('tab', { name: /anamnese/i })).toHaveAttribute(
      'data-tour',
      'patients.tab.anamnese',
    );
    expect(screen.getByRole('tab', { name: /bioimpedância/i })).toHaveAttribute(
      'data-tour',
      'patients.tab.bioimpedancia',
    );
    expect(screen.getByRole('tab', { name: /planos alimentares/i })).toHaveAttribute(
      'data-tour',
      'patients.tab.planos',
    );
    expect(screen.getByRole('tab', { name: /recordatório/i })).toHaveAttribute(
      'data-tour',
      'patients.tab.recordatorio',
    );
    expect(screen.getByRole('tab', { name: /^diário$/i })).toHaveAttribute(
      'data-tour',
      'patients.tab.diario',
    );
    expect(screen.getByRole('button', { name: /exportar evolução/i })).toHaveAttribute(
      'data-tour',
      'patients.export-evolution',
    );
  });

  it('shows the IMC card with the formatted value and category', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByText('IMC')).toBeInTheDocument();
    expect(screen.getByText('24,2 · Peso normal')).toBeInTheDocument();
  });

  it('shows a — placeholder in the IMC card when imc is null', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: { ...patient, imc: null } });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('labels the remove-photo button explicitly', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit />);
    expect(screen.getByRole('button', { name: 'Remover foto do paciente' })).toHaveTextContent('Remover foto');
  });

  it('reveals the bioimpedância placeholder when its tab is selected', async () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} />);
    // Bioimpedância lives in an inactive tab, so it is not mounted by default.
    expect(screen.queryByText(/nenhuma avaliação ainda/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /bioimpedância/i }));
    expect(await screen.findByText(/nenhuma avaliação ainda/i)).toBeInTheDocument();
  });

  it('shows the post-create banner only when created', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    const { rerender } = render(<PatientDetail id="p1" created={false} />);
    expect(screen.queryByText('Paciente criado')).not.toBeInTheDocument();
    rerender(<PatientDetail id="p1" created />);
    expect(screen.getByText('Paciente criado')).toBeInTheDocument();
  });

  it('saves clinical edits via updatePatient', async () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    mutateAsync.mockResolvedValue(patient);
    render(<PatientDetail id="p1" created={false} />);
    await userEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  });

  it('hides Save when canEdit is false', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit={false} />);
    expect(screen.queryByRole('button', { name: /salvar alterações/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^diário$/i })).toBeInTheDocument();
  });

  it('uploads a chosen photo through the mutation when the nutritionist can edit', async () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    const user = userEvent.setup();
    render(<PatientDetail id="p1" created={false} canEdit />);
    const file = new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Foto do paciente'), file);
    expect(uploadPhotoMut).toHaveBeenCalledWith(file);
  });

  it('shows a saving state on the photo control while an upload is pending', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    uploadPhotoPending = true;
    render(<PatientDetail id="p1" created={false} canEdit />);
    expect(screen.getByText('Enviando…')).toBeInTheDocument();
  });

  it('disables the header export button when there are no assessments', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    useAssessments.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByRole('button', { name: /exportar evolução/i })).toBeDisabled();
  });

  it('enables the header export button when assessments exist, on any tab', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    useAssessments.mockReturnValue({ data: [{ id: 'a1' }], isLoading: false, isError: false });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByRole('button', { name: /exportar evolução/i })).toBeEnabled();
  });

  it('shows the Silhueta tab only when canEdit', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    const { rerender } = render(<PatientDetail id="p1" created={false} canEdit />);
    expect(screen.getByRole('tab', { name: /silhueta/i })).toBeInTheDocument();

    rerender(<PatientDetail id="p1" created={false} canEdit={false} />);
    expect(screen.queryByRole('tab', { name: /silhueta/i })).not.toBeInTheDocument();
  });

  it('shows the Metas tab only when canEdit', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    const { rerender } = render(<PatientDetail id="p1" created={false} canEdit />);
    expect(screen.getByRole('tab', { name: /metas/i })).toHaveAttribute(
      'data-tour',
      'patients.tab.metas',
    );

    rerender(<PatientDetail id="p1" created={false} canEdit={false} />);
    expect(screen.queryByRole('tab', { name: /metas/i })).not.toBeInTheDocument();
  });

  it('reveals the nutrition-targets section when its tab is selected', async () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit />);
    await userEvent.click(screen.getByRole('tab', { name: /metas/i }));
    expect(await screen.findByText(/metas nutricionais/i)).toBeInTheDocument();
  });

  it('shows the LGPD consent as accepted with its date when latestConsent is set', () => {
    usePatient.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        ...patient,
        latestConsent: { policyVersion: '2026-07-09', acceptedAt: '2026-07-10T00:00:00.000Z' },
      },
    });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByText(/Consentimento LGPD: aceito em/)).toBeInTheDocument();
  });

  it('shows the LGPD consent as pending when latestConsent is null', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByText(/Consentimento LGPD: pendente/)).toBeInTheDocument();
  });

  it('shows a Demo badge when the patient is a demo', () => {
    usePatient.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { ...patient, isDemo: true },
    });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByText('Demo')).toBeInTheDocument();
  });

  it('shows an enabled Enviar convite button when NOT_INVITED with email', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByRole('button', { name: 'Enviar convite para o app' })).toBeEnabled();
  });

  it('disables Enviar convite with a hint when NOT_INVITED and email is null', () => {
    usePatient.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { ...patient, email: null },
    });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByRole('button', { name: 'Enviar convite para o app' })).toBeDisabled();
    expect(screen.getByText(/preencha o e-mail/i)).toBeInTheDocument();
  });

  it('hides Enviar convite when the patient is INVITED', () => {
    usePatient.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { ...patient, inviteStatus: 'INVITED' },
    });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.queryByRole('button', { name: 'Enviar convite para o app' })).not.toBeInTheDocument();
  });

  it('confirms before inviting and posts the invite', async () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    inviteMut.mockResolvedValue({ ...patient, inviteStatus: 'INVITED' });
    render(<PatientDetail id="p1" created={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite para o app' }));
    expect(window.confirm).toHaveBeenCalledWith(
      'O paciente vai receber um e-mail para criar a senha do app.',
    );
    expect(inviteMut).toHaveBeenCalled();
  });

  it('does not invite when the confirm dialog is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite para o app' }));
    expect(inviteMut).not.toHaveBeenCalled();
  });

  it('disables "Gerar com IA" and names the missing weight when the patient has no assessment', async () => {
    // Fixture: height/birthDate/gender/objective/activityLevel are all set, but
    // assessments is empty — weight is the only thing missing.
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit />);
    await userEvent.click(screen.getByRole('tab', { name: /planos alimentares/i }));
    expect(await screen.findByRole('button', { name: /gerar com ia/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText(/peso \(última bioimpedância\)/)).toBeInTheDocument();
  });

  it('enables "Gerar com IA" when the patient record is complete, including the latest weight', async () => {
    usePatient.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        ...patient,
        assessments: [{ id: 'a1', patientId: 'p1', weight: 70, assessmentDate: '2026-06-01T00:00:00.000Z' }],
      },
    });
    render(<PatientDetail id="p1" created={false} canEdit />);
    await userEvent.click(screen.getByRole('tab', { name: /planos alimentares/i }));
    expect(await screen.findByRole('button', { name: /gerar com ia/i })).toBeEnabled();
  });
});

describe('PatientDetail — aba persiste na URL', () => {
  it('sem parâmetro na URL, a aba ativa é Dados', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByRole('tab', { name: /^dados$/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('com ?tab=planos, a aba de planos alimentares já vem ativa na montagem', () => {
    currentSearchParams = new URLSearchParams({ tab: 'planos' });
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit />);
    expect(screen.getByRole('tab', { name: /planos alimentares/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('clicar em outra aba chama router.replace com a URL contendo tab=<novo>, sem empilhar histórico', async () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit />);
    // Bioimpedância de propósito: o conteúdo da aba de anamnese depende de um
    // QueryClientProvider que este arquivo de teste não monta.
    await userEvent.click(screen.getByRole('tab', { name: /bioimpedância/i }));
    expect(replace).toHaveBeenCalledWith('/patients/p1?tab=bioimpedancia');
    expect(push).not.toHaveBeenCalled();
  });

  it('preserva outros parâmetros da query ao trocar de aba', async () => {
    currentSearchParams = new URLSearchParams({ created: '1' });
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit />);
    await userEvent.click(screen.getByRole('tab', { name: /bioimpedância/i }));
    const url = replace.mock.calls[0][0] as string;
    expect(url).toContain('created=1');
    expect(url).toContain('tab=bioimpedancia');
  });

  it('um valor de aba desconhecido na URL cai em Dados', () => {
    currentSearchParams = new URLSearchParams({ tab: 'inexistente' });
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByRole('tab', { name: /^dados$/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('?tab=metas sem canEdit cai em Dados', () => {
    currentSearchParams = new URLSearchParams({ tab: 'metas' });
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit={false} />);
    expect(screen.getByRole('tab', { name: /^dados$/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('o atalho "Registrar peso" da seção de planos continua levando à aba de bioimpedância', async () => {
    currentSearchParams = new URLSearchParams({ tab: 'planos' });
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} canEdit />);
    await userEvent.click(await screen.findByRole('button', { name: /registrar peso/i }));
    expect(replace).toHaveBeenCalledWith('/patients/p1?tab=bioimpedancia');
  });
});
