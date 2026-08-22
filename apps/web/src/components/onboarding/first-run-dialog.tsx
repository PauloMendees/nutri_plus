'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function FirstRunMockup() {
  return (
    <figure
      role="img"
      aria-label="Prévia dos primeiros passos"
      className="overflow-hidden rounded-xl border bg-muted/40"
    >
      <div className="flex h-40 bg-[#0a5c45]">
        <div className="flex w-16 flex-col gap-1.5 p-3">
          <img src="/brand/inutri-logo-horizontal.svg" alt="" className="h-4 w-auto brightness-0 invert" />
          <div className="mt-2 h-1.5 w-10 rounded-full bg-white/40" />
          <div className="h-1.5 w-8 rounded-full bg-teal-300" />
          <div className="h-1.5 w-9 rounded-full bg-white/25" />
        </div>
        <div className="relative m-2 flex-1 rounded-lg bg-background p-3 shadow-sm">
          <p className="text-[10px] font-semibold text-foreground">Primeiros passos</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {['Lista', 'Cadastro', 'Ficha'].map((label, i) => (
              <div key={label} className="rounded-md border bg-card px-1.5 py-1.5">
                <p className="text-[8px] font-medium">{label}</p>
                <div className={`mt-1 size-4 rounded-full ${i === 0 ? 'bg-primary' : 'bg-muted'}`} />
              </div>
            ))}
          </div>
          <div className="absolute right-4 top-10 max-w-[42%] rounded-md border bg-background p-1.5 text-[8px] shadow-md ring-2 ring-primary/40">
            Clique no que está iluminado. Use Próximo, Pular ou Sair quando quiser.
          </div>
        </div>
      </div>
    </figure>
  );
}

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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Primeiros passos no iNutri</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Tutoriais guiados pelos módulos do consultório. O destaque mostra onde clicar; você
            avança com Próximo ou no próprio botão da tela, pode pular um capítulo e rever depois.
          </p>
        </DialogHeader>
        <FirstRunMockup />
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
