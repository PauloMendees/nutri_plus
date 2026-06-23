export function BioimpedanceSection() {
  return (
    <section>
      <h2 className="mb-2 font-heading text-base font-bold">Bioimpedância</h2>
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card p-8 text-center">
        <p className="font-medium">Nenhuma avaliação ainda</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Em breve você poderá registrar bioimpedância (peso, % de gordura, massa magra,
          circunferências…) e acompanhar a evolução.
        </p>
        <span className="mt-1 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
          Em breve
        </span>
      </div>
    </section>
  );
}
