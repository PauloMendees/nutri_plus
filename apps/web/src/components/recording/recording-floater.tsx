'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { FileText, Trash2 } from 'lucide-react';
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
    // Faixa fixa entre a sidebar (--sidebar-width) e a coluna do CornerWidgets
    // (bottom-4 right-4, até w-80 com a agenda aberta): o floater centraliza
    // nesse espaço livre e nunca cruza nenhum dos dois. No mobile não há
    // sidebar fixa nem widgets, e a faixa vira a largura da tela com 16px.
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center md:left-[calc(var(--sidebar-width)+1rem)] md:right-[22rem]">
      <div
        role="region"
        aria-label="Gravação em andamento"
        className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl border bg-card px-4 py-2 shadow-lg md:rounded-full"
      >
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-destructive" />
        {rec.state.status === 'uploading' ? (
          <span className="text-sm">Enviando gravação…</span>
        ) : (
          <>
            {/* Abaixo do xl a faixa livre é estreita: nome truncado, sem
                medidor, e "Abrir anamnese"/"Descartar" viram ícones. */}
            <span className="max-w-[10rem] truncate text-sm font-medium xl:max-w-[16rem]">
              Gravando · {patientName}
            </span>
            <span role="timer" aria-live="off" aria-label="Tempo de gravação" className="font-mono text-sm tabular-nums">
              {fmtElapsed(rec.elapsedSec)}
            </span>
            <span aria-hidden className="hidden h-5 items-end gap-[2px] xl:flex">
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
              aria-label="Abrir anamnese"
              title="Abrir anamnese"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              <FileText aria-hidden className="h-4 w-4 xl:hidden" />
              <span className="hidden xl:inline">Abrir anamnese</span>
            </Link>
            <Button type="button" size="sm" className="rounded-full" onClick={rec.stopAndSave}>
              Parar e salvar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Descartar"
              title="Descartar"
              className="rounded-full text-destructive"
              onClick={() => setConfirmingDiscard(true)}
            >
              <Trash2 aria-hidden className="h-4 w-4 xl:hidden" />
              <span className="hidden xl:inline">Descartar</span>
            </Button>
          </>
        )}
      </div>

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
