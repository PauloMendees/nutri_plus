import Link from 'next/link';

export function Unauthorized() {
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center">
      <h1 className="font-heading text-xl font-bold">Não autorizado</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Você não tem permissão para acessar esta página.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
      >
        Voltar para o início
      </Link>
    </div>
  );
}
