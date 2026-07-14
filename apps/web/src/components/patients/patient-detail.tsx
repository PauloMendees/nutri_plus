'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import { usePatient, useUploadPatientPhoto, useDeletePatientPhoto } from '@/lib/queries/patients';
import { EditPatientForm } from '@/components/patients/edit-patient-form';
import { BioimpedanceSection } from '@/components/patients/bioimpedance-section';
import { MealPlansSection } from '@/components/patients/meal-plans-section';
import { CreatedBanner } from '@/components/patients/created-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PatientAvatar } from '@/components/patients/patient-avatar';
import { Button } from '@/components/ui/button';

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
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadPhoto = useUploadPatientPhoto(id);
  const deletePhoto = useDeletePatientPhoto(id);
  const photoPending = uploadPhoto.isPending || deletePhoto.isPending;

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

  if (query.isLoading) {
    return <Skeleton className="h-64 w-full max-w-3xl" />;
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/patients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para pacientes
      </Link>

      <CreatedBanner show={created} />

      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <div className="relative">
          <PatientAvatar name={patient.user.name} photoUrl={patient.photoUrl} className="size-16 text-lg" />
          {photoPending && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-bold">{patient.user.name}</p>
          <p className="truncate text-sm text-muted-foreground">{patient.user.email}</p>
          {canEdit && (
            <div className="mt-1 flex gap-2">
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
                >
                  Remover
                </Button>
              )}
            </div>
          )}
        </div>
        <span className="ml-auto self-start rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
          Paciente
        </span>
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="bioimpedancia">Bioimpedância</TabsTrigger>
          <TabsTrigger value="planos">Planos alimentares</TabsTrigger>
        </TabsList>
        <TabsContent value="dados">
          <EditPatientForm patient={patient} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="bioimpedancia">
          <BioimpedanceSection patientId={patient.id} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="planos">
          <MealPlansSection patientId={patient.id} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
