import { Logo } from '@/components/brand/logo';

const STORES = [
  { name: 'App Store', sub: 'Baixar na' },
  { name: 'Google Play', sub: 'Disponível no' },
] as const;

export default function DownloadAppPage() {
  return (
    <div className="space-y-6 text-center">
      <Logo variant="icon" className="mx-auto h-12" />

      <div className="space-y-2">
        <h2 className="font-heading text-2xl font-bold text-foreground">Tudo pronto! 🎉</h2>
        <p className="text-sm text-muted-foreground">
          Sua senha foi criada. O iNutri para pacientes fica no seu celular — baixe o app para
          acessar seus planos, avaliações e acompanhamento.
        </p>
      </div>

      <div className="space-y-3">
        {STORES.map((store) => (
          <div
            key={store.name}
            aria-disabled="true"
            className="flex cursor-not-allowed items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3 opacity-60"
          >
            <span className="text-left">
              <span className="block text-xs text-muted-foreground">{store.sub}</span>
              <span className="block text-sm font-semibold text-foreground">{store.name}</span>
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              em breve
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
