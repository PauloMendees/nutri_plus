'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { usePatchOnboardingTour } from '@/lib/queries/onboarding';
import { usePatients } from '@/lib/queries/patients';

// Quem já cadastrou pacientes por conta própria não precisa do paciente de
// demonstração para seguir o tour de Pacientes: escolhe um dos seus, e ele passa
// a ser o paciente do tour (gravado em demoPatientId). A exclusão de demo
// continua restrita a isDemo, então um paciente real nunca é apagado por aqui.
export function UseOwnPatientBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <p className="flex-1 text-sm">
        Já tem pacientes cadastrados? Siga o tutorial com um deles em vez do paciente de demonstração.
      </p>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Usar um paciente meu
      </Button>
      <PickPatientDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function PickPatientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const patients = usePatients({ search: debounced || undefined, pageSize: 8 });
  const patch = usePatchOnboardingTour();
  const items = patients.data?.items ?? [];

  async function pick(patientId: string) {
    try {
      await patch.mutateAsync('patients', { demoPatientId: patientId });
      onOpenChange(false);
    } catch {
      toast.error('Não foi possível usar este paciente no tutorial.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Usar um paciente seu no tutorial</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Os registros criados nos próximos capítulos (anamnese, bioimpedância, recordatório e plano
          alimentar) ficam salvos neste paciente.
        </p>
        <Input
          placeholder="Buscar paciente"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar paciente"
        />
        {patients.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum paciente encontrado.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={patch.isPending}
                  onClick={() => void pick(p.id)}
                  className="flex w-full min-w-0 flex-col rounded-lg px-3 py-2 text-left hover:bg-muted/60 disabled:opacity-60"
                >
                  <span className="truncate font-medium">{p.name}</span>
                  {p.email ? <span className="truncate text-xs text-muted-foreground">{p.email}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
