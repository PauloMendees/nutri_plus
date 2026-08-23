'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDeleteDemoPatient } from '@/lib/queries/patients';

export function DeleteDemoBanner({ patientId }: { patientId: string }) {
  const { mutateAsync, isPending } = useDeleteDemoPatient();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <p className="flex-1 text-sm">Este é um paciente de demonstração.</p>
      <Button
        type="button"
        variant={confirming ? 'destructive' : 'outline'}
        disabled={isPending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          void mutateAsync(patientId);
        }}
      >
        {confirming ? 'Confirmar exclusão' : 'Apagar paciente de demonstração'}
      </Button>
    </div>
  );
}
