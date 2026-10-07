'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import { XIcon } from 'lucide-react';
import { INTRO_VIDEO, INTRO_VIDEO_EMBED_URL } from '@/lib/onboarding/intro-video';

// Player do vídeo de introdução, por cima de tudo (inclusive da apresentação).
// O iframe só existe enquanto está aberto: fechar remove o vídeo e para o som.
export function IntroVideoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay data-intro-video="" className="fixed inset-0 z-[60] bg-black/85 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-intro-video=""
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 text-white outline-none"
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">iNutri</p>
              <DialogPrimitive.Title className="font-heading text-xl font-bold">
                {INTRO_VIDEO.title}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              aria-label="Fechar vídeo"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
            >
              <XIcon className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
            <iframe
              src={INTRO_VIDEO_EMBED_URL}
              title={INTRO_VIDEO.title}
              className="size-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
          <p className="mt-3 text-center text-xs text-white/60">Clique fora do vídeo para fechar</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
