'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

// Sem `onProceed` (ex.: funcionário sem permissão de registrar avaliação) o
// botão some, em vez de aparecer desabilitado com cara de ativo.
export function CreatedBanner({ show, onProceed }: { show: boolean; onProceed?: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (!show || dismissed) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-secondary/60 p-4">
      <div className="flex-1">
        <p className="font-semibold">Paciente criado</p>
        <p className="text-sm text-muted-foreground">Quer registrar a primeira bioimpedância agora?</p>
      </div>
      <div className="flex gap-2">
        {onProceed && (
          <Button
            className="rounded-full"
            onClick={() => {
              setDismissed(true);
              onProceed();
            }}
          >
            Prosseguir para bioimpedância
          </Button>
        )}
        <Button variant="outline" className="rounded-full" onClick={() => setDismissed(true)}>
          Deixar para depois
        </Button>
      </div>
    </div>
  );
}
