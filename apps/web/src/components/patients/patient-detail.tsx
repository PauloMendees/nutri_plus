'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { usePatient } from '@/lib/queries/patients';
import { EditPatientForm } from '@/components/patients/edit-patient-form';
import { BioimpedanceSection } from '@/components/patients/bioimpedance-section';
import { CreatedBanner } from '@/components/patients/created-banner';
import { Skeleton } from '@/components/ui/skeleton';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
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
        <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
          {initials(patient.user.name)}
        </span>
        <div>
          <p className="font-bold">{patient.user.name}</p>
          <p className="text-sm text-muted-foreground">{patient.user.email}</p>
        </div>
        <span className="ml-auto rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
          Paciente
        </span>
      </div>

      <EditPatientForm patient={patient} canEdit={canEdit} />

      <BioimpedanceSection patientId={patient.id} canEdit={canEdit} />
    </div>
  );
}
