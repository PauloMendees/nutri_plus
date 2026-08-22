'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function FirstRunDialog({
  open,
  onDismiss,
  onStart,
}: {
  open: boolean;
  onDismiss: () => void;
  onStart: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conheça o iNutri</DialogTitle>
        </DialogHeader>
        <DialogFooter className="justify-end">
          <Button type="button" variant="ghost" onClick={onDismiss}>
            Agora não
          </Button>
          <Button type="button" onClick={onStart}>
            Ver primeiros passos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
