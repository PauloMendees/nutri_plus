import { cn } from '@/lib/utils';

/** Branded product UI stand-ins used until real screenshots are provided. */

export function DashboardMockup({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-[#0A5C45]/15 ring-1 ring-black/5',
        className,
      )}
      aria-hidden
    >
      <div className="flex h-9 items-center gap-2 border-b border-border bg-muted/60 px-3">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-[11px] text-muted-foreground">iNutri · Planos alimentares</span>
      </div>
      <div className="flex min-h-[280px] sm:min-h-[320px]">
        <aside className="hidden w-[72px] shrink-0 flex-col gap-3 bg-[#0A5C45] p-3 sm:flex">
          <div className="mx-auto size-7 rounded-lg bg-[#14BFA6]/30" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'mx-auto h-8 w-8 rounded-lg',
                i === 1 ? 'bg-[#14BFA6]' : 'bg-white/10',
              )}
            />
          ))}
        </aside>
        <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Paciente</p>
              <p className="font-heading text-sm font-semibold text-foreground sm:text-base">
                Ana Souza
              </p>
            </div>
            <div className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground sm:text-xs">
              ✨ Gerar com IA
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { t: 'Café da manhã', k: '420 kcal' },
              { t: 'Almoço', k: '680 kcal' },
              { t: 'Jantar', k: '520 kcal' },
            ].map((m) => (
              <div
                key={m.t}
                className="rounded-lg border border-border bg-muted/40 p-2.5 sm:p-3"
              >
                <p className="text-xs font-semibold text-secondary-foreground">{m.t}</p>
                <p className="mt-1 text-[10px] text-muted-foreground sm:text-[11px]">
                  3 itens · {m.k}
                </p>
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full rounded bg-border" />
                  <div className="h-1.5 w-4/5 rounded bg-border" />
                  <div className="h-1.5 w-3/5 rounded bg-border" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-auto flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <div>
              <p className="text-xs font-medium text-secondary-foreground">Metas do dia</p>
              <p className="text-[10px] text-muted-foreground">1.620 kcal · P 120g · C 160g · G 50g</p>
            </div>
            <div className="text-right text-[11px] font-semibold text-primary">PDF pronto</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PatientAppMockup({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'mx-auto w-[200px] overflow-hidden rounded-[1.75rem] border-[6px] border-[#0f1714] bg-[#0f1714] shadow-2xl shadow-black/25 sm:w-[220px]',
        className,
      )}
      aria-hidden
    >
      <div className="rounded-[1.25rem] bg-background">
        <div className="flex justify-center pt-2">
          <div className="h-1.5 w-16 rounded-full bg-[#0f1714]/80" />
        </div>
        <div className="space-y-3 px-3 pb-4 pt-3">
          <div className="flex items-center justify-between">
            <p className="font-heading text-sm font-bold text-secondary-foreground">Meu plano</p>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
              Hoje
            </span>
          </div>
          {[
            { t: 'Café', d: 'Iogurte + granola + fruta' },
            { t: 'Almoço', d: 'Arroz, feijão, frango e salada' },
            { t: 'Lanche', d: 'Whey + banana' },
          ].map((row) => (
            <div key={row.t} className="rounded-xl border border-border bg-muted/50 p-2.5">
              <p className="text-[11px] font-semibold text-foreground">{row.t}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{row.d}</p>
            </div>
          ))}
          <div className="rounded-xl bg-[#0A5C45] px-3 py-2.5 text-center text-[11px] font-semibold text-white">
            Ver plano completo
          </div>
        </div>
      </div>
    </div>
  );
}

export function SilhuetaMockup({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card p-4 shadow-lg shadow-[#0A5C45]/10 sm:p-5',
        className,
      )}
      aria-hidden
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-secondary-foreground">
            Silhueta
          </p>
          <p className="font-heading text-sm font-semibold text-foreground">Estimativa por foto</p>
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
          Não diagnóstico
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { l: 'Gordura', v: '22%' },
          { l: 'Massa magra', v: '48 kg' },
          { l: 'IMC', v: '23,1' },
        ].map((m) => (
          <div key={m.l} className="rounded-lg bg-muted/70 p-2 text-center">
            <p className="text-[10px] text-muted-foreground">{m.l}</p>
            <p className="font-heading text-sm font-bold text-secondary-foreground">{m.v}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        Consentimento registrado · fotos não armazenadas · compare Silhueta × Silhueta
      </p>
    </div>
  );
}
