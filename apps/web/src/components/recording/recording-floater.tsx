'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { DiscardRecordingDialog } from './discard-recording-dialog';
import { fmtElapsed } from './format';
import { useRecording } from './recording-provider';

// Barras do medidor no floater: as mais recentes, para caber numa pílula.
const FLOATER_BARS = 8;

// Controle da gravação fora da aba Anamnese do paciente gravado. Não inicia
// gravações: o início fica na Anamnese, junto do consentimento do paciente.
export function RecordingFloater() {
  const rec = useRecording();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  if (rec.state.status === 'idle') return null;
  const { patientId, patientName } = rec.state;
  const onItsAnamnese =
    pathname === `/patients/${patientId}` && searchParams.get('tab') === 'anamnese';
  if (onItsAnamnese) return null;

  return (
    <div
      role="region"
      aria-label="Gravação em andamento"
      className="fixed inset-x-4 bottom-4 z-50 flex flex-wrap items-center justify-center gap-3 rounded-2xl border bg-card px-4 py-2 shadow-lg md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:rounded-full"
    >
      <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
      {rec.state.status === 'uploading' ? (
        <span className="text-sm">Enviando gravação…</span>
      ) : (
        <>
          <span className="text-sm font-medium">Gravando · {patientName}</span>
          <span role="timer" aria-live="off" aria-label="Tempo de gravação" className="font-mono text-sm tabular-nums">
            {fmtElapsed(rec.elapsedSec)}
          </span>
          <span aria-hidden className="flex h-5 items-end gap-[2px]">
            {rec.levels.slice(-FLOATER_BARS).map((level, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-primary/70"
                style={{ height: `${Math.max(12, level * 100)}%` }}
              />
            ))}
          </span>
          <Link
            href={`/patients/${patientId}?tab=anamnese`}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Abrir anamnese
          </Link>
          <Button type="button" size="sm" className="rounded-full" onClick={rec.stopAndSave}>
            Parar e salvar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full text-destructive"
            onClick={() => setConfirmingDiscard(true)}
          >
            Descartar
          </Button>
        </>
      )}

      <DiscardRecordingDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        elapsedSec={rec.elapsedSec}
        onConfirm={() => {
          setConfirmingDiscard(false);
          rec.discard();
        }}
      />
    </div>
  );
}
