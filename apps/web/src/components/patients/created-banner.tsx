'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function CreatedBanner({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  if (!show || dismissed) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-secondary/60 p-4">
      <div className="flex-1">
        <p className="font-semibold">Paciente criado e convidado por e-mail</p>
        <p className="text-sm text-muted-foreground">Quer registrar a primeira bioimpedância agora?</p>
      </div>
      <div className="flex gap-2">
        <Button className="rounded-full" disabled title="Em breve">
          Prosseguir para bioimpedância
        </Button>
        <Button variant="outline" className="rounded-full" onClick={() => setDismissed(true)}>
          Deixar para depois
        </Button>
      </div>
    </div>
  );
}
