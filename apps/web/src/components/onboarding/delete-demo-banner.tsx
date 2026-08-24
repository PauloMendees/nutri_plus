'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useDeleteAppointment } from '@/lib/queries/appointments';
import { useDeleteDemoPatient } from '@/lib/queries/patients';
import { useDeleteTransaction } from '@/lib/queries/transactions';
import { ONBOARDING_KEY } from '@/lib/queries/onboarding';

export function DemoCleanupBanner({
  description,
  idleLabel,
  isPending,
  onConfirm,
}: {
  description: string;
  idleLabel: string;
  isPending: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <p className="flex-1 text-sm">{description}</p>
      <Button
        type="button"
        variant={confirming ? 'destructive' : 'outline'}
        disabled={isPending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          void onConfirm();
        }}
      >
        {confirming ? 'Confirmar exclusão' : idleLabel}
      </Button>
    </div>
  );
}

export function DeleteDemoBanner({ patientId }: { patientId: string }) {
  const { mutateAsync, isPending } = useDeleteDemoPatient();
  return (
    <DemoCleanupBanner
      description="Este é um paciente de demonstração."
      idleLabel="Apagar paciente de demonstração"
      isPending={isPending}
      onConfirm={() => void mutateAsync(patientId)}
    />
  );
}

export function DeleteDemoAppointmentBanner({ appointmentId }: { appointmentId: string }) {
  const qc = useQueryClient();
  const { mutateAsync, isPending } = useDeleteAppointment();
  return (
    <DemoCleanupBanner
      description="Este é um agendamento de demonstração."
      idleLabel="Apagar agendamento de demonstração"
      isPending={isPending}
      onConfirm={async () => {
        await mutateAsync(appointmentId);
        await qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
      }}
    />
  );
}

export function DeleteDemoTransactionBanner({ transactionId }: { transactionId: string }) {
  const qc = useQueryClient();
  const { mutateAsync, isPending } = useDeleteTransaction();
  return (
    <DemoCleanupBanner
      description="Este é um lançamento de demonstração."
      idleLabel="Apagar lançamento de demonstração"
      isPending={isPending}
      onConfirm={async () => {
        await mutateAsync(transactionId);
        await qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
      }}
    />
  );
}
