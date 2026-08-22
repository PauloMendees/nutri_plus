'use client';

import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';

const TOOLTIP_Z = 1_000_000_010;

export function TourTooltip({
  title,
  body,
  rect,
  fixture,
  advance,
  onSkipChapter,
  onExit,
  onFillFixture,
  onNext,
}: {
  title: string;
  body: string;
  rect: DOMRect;
  fixture?: string;
  advance: 'click' | 'next';
  onSkipChapter: () => void;
  onExit: () => void;
  onFillFixture?: () => void;
  onNext?: () => void;
}) {
  const tooltipHeight = 200;
  const preferBelow = rect.height < window.innerHeight * 0.4;
  const rawTop = preferBelow ? rect.bottom + 12 : rect.top + 12;
  const top = Math.max(8, Math.min(rawTop, window.innerHeight - tooltipHeight - 8));
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 328));

  return createPortal(
    <div
      role="dialog"
      aria-label={title}
      className="nutri-tour-tooltip pointer-events-auto fixed w-80 rounded-xl border bg-background p-4 shadow-lg"
      style={{ top, left, zIndex: TOOLTIP_Z }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onSkipChapter}>
          Pular capítulo
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onExit}>
          Sair
        </Button>
        {fixture ? (
          <Button type="button" variant="outline" size="sm" onClick={onFillFixture}>
            Preencher com dados fictícios
          </Button>
        ) : null}
        {advance === 'next' ? (
          <Button type="button" size="sm" onClick={onNext}>
            Próximo
          </Button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function TourMissingAnchor({ onBackToHub }: { onBackToHub: () => void }) {
  return createPortal(
    <div
      role="status"
      className="nutri-tour-tooltip fixed w-80 rounded-xl border bg-background p-4 shadow-lg"
      style={{ top: 24, left: 24, zIndex: TOOLTIP_Z }}
    >
      <p className="font-semibold">Não encontrei este passo</p>
      <div className="mt-3">
        <Button type="button" size="sm" asChild>
          <a
            href="/primeiros-passos"
            onClick={(event) => {
              event.preventDefault();
              onBackToHub();
            }}
          >
            Voltar ao hub
          </a>
        </Button>
      </div>
    </div>,
    document.body,
  );
}
