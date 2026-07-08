type PagePlaceholderProps = {
  title: string;
  description?: string;
};

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">{title}</h1>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card p-10 text-center">
        <p className="font-medium text-foreground/80">Em breve</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {description ?? 'Este módulo ainda está em construção.'}
        </p>
      </div>
    </div>
  );
}
