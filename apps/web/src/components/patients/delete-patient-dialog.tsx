'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { patientExportFileName } from '@nutri-plus/shared-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api/client';
import { exportPatientData } from '@/lib/api/patients';
import { useDeletePatient } from '@/lib/queries/patients';

// Mesma normalização da API (confirmName): maiúsculas e espaços nas pontas não contam.
const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

export function DeletePatientDialog({
  patient,
  open,
  onOpenChange,
}: {
  patient: { id: string; name: string; email: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const del = useDeletePatient();
  const [typed, setTyped] = useState('');
  const [downloading, setDownloading] = useState(false);
  const matches = norm(typed) !== '' && norm(typed) === norm(patient.name);

  // Fecha por qualquer caminho (Cancelar, Esc, overlay, sucesso) e zera o nome:
  // o diálogo continua montado na ficha, e reabrir com o nome já digitado
  // deixaria "Excluir definitivamente" habilitado de cara.
  function handleOpenChange(next: boolean) {
    if (!next) setTyped('');
    onOpenChange(next);
  }

  async function download() {
    setDownloading(true);
    try {
      const data = await exportPatientData(patient.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = patientExportFileName(patient.name);
      // Alguns navegadores (Firefox, Safari) ignoram o click num <a> fora do
      // documento, e revogar a URL na hora cancela o download antes de começar.
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error('Não foi possível baixar os dados.');
    } finally {
      setDownloading(false);
    }
  }

  async function confirm() {
    try {
      await del.mutateAsync({ id: patient.id, confirmName: typed });
      toast.success('Paciente excluído.');
      handleOpenChange(false);
      router.push('/patients');
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 502
          ? 'Não foi possível enviar o e-mail com os dados; nada foi excluído.'
          : 'Não foi possível excluir o paciente.',
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Excluir {patient.name}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Todos os dados do paciente serão apagados definitivamente: ficha, anamnese, avaliações,
            planos alimentares, recordatórios, consultas da agenda e gravações. Se ele usa o app, o acesso também será
            removido. Esta ação não pode ser desfeita.
          </p>
          {patient.email ? (
            <p>
              Enviaremos uma cópia dos dados para <strong className="text-foreground">{patient.email}</strong>{' '}
              antes de excluir.
            </p>
          ) : (
            <div className="space-y-2">
              <p>
                Este paciente não tem e-mail cadastrado. Baixe o arquivo com os dados antes de excluir.
              </p>
              <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={download} disabled={downloading}>
                {downloading ? 'Baixando…' : 'Baixar dados'}
              </Button>
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-foreground">Digite o nome do paciente para confirmar</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={patient.name} />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!matches || del.isPending}
            onClick={confirm}
          >
            {del.isPending ? 'Excluindo…' : 'Excluir definitivamente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
