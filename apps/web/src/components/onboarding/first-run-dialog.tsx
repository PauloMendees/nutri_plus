'use client';

import { useState } from 'react';
import { Play, UserPlus } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { INTRO_VIDEO, INTRO_VIDEO_THUMBNAIL_URL } from '@/lib/onboarding/intro-video';
import { cn } from '@/lib/utils';
import { IntroVideoDialog, isIntroVideoEvent } from './intro-video-dialog';

const STEP_TITLES = ['Boas-vindas ao iNutri', 'Conheça o iNutri', 'Comece por aqui'] as const;

function WelcomeStep() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        A partir de agora, o iNutri cuida da rotina do seu consultório — pacientes, planos
        alimentares, agenda e financeiro — pra sobrar mais tempo para o atendimento.
      </p>
      <p className="text-xs text-muted-foreground/80">Em poucos passos, vamos te mostrar como começar.</p>
    </div>
  );
}

function VideoStep({ onPlay }: { onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Assistir à introdução (${INTRO_VIDEO.duration})`}
      className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-[#0a5c45] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura externa do YouTube */}
      <img
        src={INTRO_VIDEO_THUMBNAIL_URL}
        alt=""
        className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <span className="absolute inset-0 bg-linear-to-t from-[#0a1e18]/80 via-[#0a1e18]/20 to-transparent" />
      <span className="absolute bottom-3 left-3 flex items-center gap-3 text-white">
        <span className="flex size-11 items-center justify-center rounded-full bg-white text-[#0a5c45] shadow-md transition-transform group-hover:scale-110">
          <Play className="ml-0.5 size-5 fill-current" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-[10px] font-bold uppercase tracking-widest text-white/80">
            Vídeo · {INTRO_VIDEO.duration}
          </span>
          <span className="block text-sm font-semibold">Assistir à introdução</span>
        </span>
      </span>
    </button>
  );
}

function FirstPatientStep() {
  return (
    <div className="space-y-3">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/15 text-[#0a5c45]">
        <UserPlus className="size-8" aria-hidden="true" />
      </div>
      <p className="font-heading text-lg font-bold text-foreground">Cadastre seu primeiro paciente</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Vamos colocar o iNutri em prática? Cadastre seu primeiro paciente para conhecer os
        principais recursos da plataforma.
      </p>
      <p className="rounded-xl border bg-muted px-3 py-2.5 text-sm text-foreground">
        Pode ser um paciente <strong>real ou fictício</strong>.
      </p>
    </div>
  );
}

// Apresentação de primeiros passos: abre uma vez, depois do cadastro (ver
// FirstRunHost). Boas-vindas → vídeo de introdução → primeiro paciente.
export function FirstRunDialog({
  open,
  onDismiss,
  onCreatePatient,
}: {
  open: boolean;
  onDismiss: () => void;
  onCreatePatient: () => void;
}) {
  const [step, setStep] = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);
  const last = STEP_TITLES.length - 1;

  function next() {
    if (step === last) onCreatePatient();
    else setStep(step + 1);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onDismiss();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        // Fechar o vídeo (clique fora dele) não pode fechar a apresentação.
        onPointerDownOutside={(event) => {
          if (videoOpen || isIntroVideoEvent(event)) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (videoOpen || isIntroVideoEvent(event)) event.preventDefault();
        }}
        className="max-w-lg gap-0 overflow-hidden p-0 [&>button:last-child]:flex [&>button:last-child]:size-8 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-white/20 [&>button:last-child]:text-white [&>button:last-child]:opacity-100"
      >
        <div className="flex h-40 flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_20%_20%,rgba(20,191,166,0.55),transparent_55%),radial-gradient(circle_at_85%_80%,rgba(20,191,166,0.35),transparent_50%),linear-gradient(135deg,#0a5c45,#0d7a5e)]">
          <span className="flex size-12 items-center justify-center rounded-full bg-white shadow-sm">
            <Logo variant="icon" className="h-6" />
          </span>
          <DialogTitle className="text-2xl text-white">{STEP_TITLES[step]}</DialogTitle>
        </div>

        <div className="flex min-h-56 flex-col justify-center px-7 py-6 text-center">
          {step === 0 && <WelcomeStep />}
          {step === 1 && <VideoStep onPlay={() => setVideoOpen(true)} />}
          {step === 2 && <FirstPatientStep />}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => (step === 0 ? onDismiss() : setStep(step - 1))}
          >
            {step === 0 ? 'Pular apresentação' : 'Voltar'}
          </Button>
          <div className="flex gap-1.5" aria-hidden="true">
            {STEP_TITLES.map((title, i) => (
              <span
                key={title}
                className={cn('h-1.5 rounded-full transition-all', i === step ? 'w-5 bg-primary' : 'w-1.5 bg-border')}
              />
            ))}
          </div>
          <Button type="button" className="rounded-full" onClick={next}>
            {step === 0 ? 'Vamos lá!' : step === last ? 'Cadastrar primeiro paciente' : 'Próximo'}
          </Button>
        </div>
        {/* Dentro do conteúdo: o Radix trata o player como diálogo aninhado. */}
        <IntroVideoDialog open={videoOpen} onOpenChange={setVideoOpen} />
      </DialogContent>
    </Dialog>
  );
}
