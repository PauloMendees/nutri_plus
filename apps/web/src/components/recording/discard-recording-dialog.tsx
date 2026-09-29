'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fmtElapsed } from './format';

// Modal, e não o confirm inline usado na exclusão: descartar uma consulta
// inteira por clique errado é caro demais. A gravação continua correndo
// enquanto o diálogo está aberto.
export function DiscardRecordingDialog({
  open,
  onOpenChange,
  elapsedSec,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  elapsedSec: number;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Descartar esta gravação?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          O áudio gravado até agora ({fmtElapsed(elapsedSec)}) será perdido e nada
          será salvo. A gravação continua enquanto você decide.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Continuar gravando
          </Button>
          <Button
            type="button"
            className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Descartar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
