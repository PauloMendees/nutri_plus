'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Loader2, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { missingPlanInputs, whatsappMeUrl } from '@nutri-plus/shared-types';
import { ApiError } from '@/lib/api/client';
import {
  usePatient,
  useInvitePatient,
  useUploadPatientPhoto,
  useDeletePatientPhoto,
} from '@/lib/queries/patients';
import { useAssessments } from '@/lib/queries/assessments';
import { downloadAssessmentsPdf } from '@/lib/api/assessments';
import { EditPatientForm } from '@/components/patients/edit-patient-form';
import { AiJobsPanel } from '@/components/patients/ai-jobs-panel';
import { AnamneseSection } from '@/components/patients/anamnese-section';
import { ConsultationAudioSection } from '@/components/patients/consultation-audio-section';
import { BioimpedanceSection } from '@/components/patients/bioimpedance-section';
import { MealPlansSection } from '@/components/patients/meal-plans-section';
import { RecordatorioSection } from '@/components/patients/recordatorio-section';
import { MealDiarySection } from '@/components/patients/meal-diary-section';
import { SilhuetaSection } from '@/components/patients/silhueta-section';
import { NutritionTargetsSection } from '@/components/patients/nutrition-targets-section';
import { CreatedBanner } from '@/components/patients/created-banner';
import { ProGate } from '@/components/billing/pro-gate';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PatientAvatar } from '@/components/patients/patient-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { INVITE_STATUS_LABELS } from '@/lib/patients/labels';
import { formatImc } from '@/lib/health/imc';

const TAB_VALUES = [
  'dados',
  'anamnese',
  'bioimpedancia',
  'metas',
  'planos',
  'recordatorio',
  'diario',
  'silhueta',
] as const;
type TabValue = (typeof TAB_VALUES)[number];

// A aba controla o que aparece na URL (?tab=), para um F5 não voltar sempre
// para "Dados". "metas" e "silhueta" só existem com canEdit — sem permissão,
// mesmo um link direto para elas cai em "Dados" em vez de tentar ativar um
// TabsTrigger que não foi renderizado.
function resolveTab(raw: string | null, canEdit: boolean): TabValue {
  const match = TAB_VALUES.find((v) => v === raw);
  if (!match) return 'dados';
  if ((match === 'metas' || match === 'silhueta') && !canEdit) return 'dados';
  return match;
}

export function PatientDetail({
  id,
  created,
  canEdit = true,
}: {
  id: string;
  created: boolean;
  canEdit?: boolean;
}) {
  const query = usePatient(id);
  const invite = useInvitePatient(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadPhoto = useUploadPatientPhoto(id);
  const deletePhoto = useDeletePatientPhoto(id);
  const photoPending = uploadPhoto.isPending || deletePhoto.isPending;
  const assessments = useAssessments(id);
  const [exporting, setExporting] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Deriva direto de searchParams em vez de useState: nenhum efeito precisa
  // sincronizar os dois sentidos, e um F5 já chega na aba certa.
  const tab = resolveTab(searchParams.get('tab'), canEdit);

  // Escreve a aba com replace (não push): trocar de aba não deve empilhar
  // histórico — o botão voltar do navegador precisa sair da ficha, não
  // percorrer abas. Preserva os demais parâmetros da query (ex.: `created=1`).
  function goToTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function onExport() {
    setExporting(true);
    try {
      await downloadAssessmentsPdf(id);
    } catch {
      toast.error('Não foi possível exportar o PDF.');
    } finally {
      setExporting(false);
    }
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadPhoto.mutateAsync(file);
      toast.success('Foto atualizada.');
    } catch {
      toast.error('Não foi possível enviar a foto.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onRemovePhoto() {
    try {
      await deletePhoto.mutateAsync();
      toast.success('Foto removida.');
    } catch {
      toast.error('Não foi possível remover a foto.');
    }
  }

  async function onInvite() {
    if (!window.confirm('O paciente vai receber um e-mail para criar a senha do app.')) return;
    try {
      await invite.mutateAsync();
      toast.success('Convite enviado.');
    } catch {
      toast.error('Não foi possível enviar o convite. Tente novamente.');
    }
  }

  if (query.isLoading) {
    return <Skeleton className="h-64 w-full max-w-6xl" />;
  }

  if (query.isError || !query.data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {notFound ? 'Paciente não encontrado.' : 'Erro ao carregar o paciente.'}
      </div>
    );
  }

  const patient = query.data;
  const missingInputs = missingPlanInputs(patient, patient.assessments[0]?.weight);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href="/patients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para pacientes
      </Link>

      <CreatedBanner show={created} />

      <div
        className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-start"
        data-tour="patients.detail.header"
      >
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="relative shrink-0">
            <PatientAvatar name={patient.name} photoUrl={patient.photoUrl} className="size-16 text-lg" />
            {photoPending && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-bold">
              {patient.name}
              {patient.isDemo ? <Badge>Demo</Badge> : null}
              <Badge variant="outline">{INVITE_STATUS_LABELS[patient.inviteStatus]}</Badge>
            </p>
            <p className="truncate text-sm text-muted-foreground">{patient.email ?? '—'}</p>
            {patient.phone ? (
              <a
                href={whatsappMeUrl(patient.phone)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="mt-1 inline-block break-all text-sm font-medium text-primary hover:underline"
              >
                {patient.phone}
              </a>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {patient.latestConsent
                ? `Consentimento LGPD: aceito em ${new Date(patient.latestConsent.acceptedAt).toLocaleDateString('pt-BR')}`
                : 'Consentimento LGPD: pendente'}
            </p>
            {canEdit && (
              <div className="mt-2 flex flex-wrap gap-2">
                <label
                  aria-disabled={photoPending}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted/40 ${photoPending ? 'pointer-events-none opacity-60' : ''}`}
                >
                  {photoPending ? 'Enviando…' : patient.photoUrl ? 'Trocar foto' : 'Adicionar foto'}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    aria-label="Foto do paciente"
                    onChange={onPickPhoto}
                    disabled={photoPending}
                  />
                </label>
                {patient.photoUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full text-destructive"
                    onClick={onRemovePhoto}
                    disabled={photoPending}
                    aria-label="Remover foto do paciente"
                  >
                    Remover foto
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          {patient.inviteStatus === 'NOT_INVITED' && (
            <div className="flex flex-col gap-1 sm:items-end">
              <Button
                type="button"
                className="w-full rounded-full sm:w-auto"
                disabled={!canEdit || !patient.email || invite.isPending}
                onClick={onInvite}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {invite.isPending ? 'Enviando…' : 'Enviar convite para o app'}
              </Button>
              {!patient.email ? (
                <p className="text-xs text-muted-foreground sm:max-w-56 sm:text-right">
                  Preencha o e-mail na ficha para enviar o convite.
                </p>
              ) : null}
            </div>
          )}
          <span className="hidden rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground sm:inline-flex">
            Paciente
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full rounded-full sm:w-auto"
            onClick={onExport}
            disabled={exporting || (assessments.data?.length ?? 0) === 0}
            data-tour="patients.export-evolution"
          >
            {exporting ? 'Exportando…' : 'Exportar evolução'}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground">IMC</p>
        <p className="text-lg font-bold">{formatImc(patient.imc)}</p>
      </div>

      <Tabs value={tab} onValueChange={goToTab}>
        <TabsList>
          <TabsTrigger value="dados" data-tour="patients.tab.dados">
            Dados
          </TabsTrigger>
          <TabsTrigger value="anamnese" data-tour="patients.tab.anamnese">
            Anamnese
          </TabsTrigger>
          <TabsTrigger value="bioimpedancia" data-tour="patients.tab.bioimpedancia">
            Bioimpedância
          </TabsTrigger>
          {canEdit && (
            <TabsTrigger value="metas" data-tour="patients.tab.metas">
              Metas
            </TabsTrigger>
          )}
          <TabsTrigger value="planos" data-tour="patients.tab.planos">
            Planos alimentares
          </TabsTrigger>
          <TabsTrigger value="recordatorio" data-tour="patients.tab.recordatorio">
            Recordatório
          </TabsTrigger>
          <TabsTrigger value="diario" data-tour="patients.tab.diario">
            Diário
          </TabsTrigger>
          {canEdit && (
            <ProGate feature="silhueta" label="Silhueta (Pro)">
              <TabsTrigger value="silhueta">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Silhueta
              </TabsTrigger>
            </ProGate>
          )}
        </TabsList>
        <TabsContent value="dados">
          <EditPatientForm patient={patient} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="anamnese">
          {/* Recorder + history live inside the Anamnese tab so the nutritionist can
              record the consultation while filling the anamnese (switching tabs
              would unmount the recorder and release the mic). */}
          <div className="space-y-6">
            <ConsultationAudioSection patientId={patient.id} canEdit={canEdit} />
            <AnamneseSection patientId={patient.id} canEdit={canEdit} />
          </div>
        </TabsContent>
        <TabsContent value="bioimpedancia">
          <BioimpedanceSection patientId={patient.id} canEdit={canEdit} />
        </TabsContent>
        {canEdit && (
          <TabsContent value="metas">
            <NutritionTargetsSection patient={patient} />
          </TabsContent>
        )}
        <TabsContent value="planos">
          <div className="space-y-6">
            <AiJobsPanel patientId={patient.id} />
            <MealPlansSection
              patientId={patient.id}
              canEdit={canEdit}
              missingInputs={missingInputs}
              onGoToTab={goToTab}
            />
          </div>
        </TabsContent>
        <TabsContent value="recordatorio">
          <RecordatorioSection patientId={patient.id} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="diario">
          <MealDiarySection patientId={patient.id} />
        </TabsContent>
        {canEdit && (
          <TabsContent value="silhueta">
            <SilhuetaSection patientId={patient.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
