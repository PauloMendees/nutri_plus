import Link from 'next/link';
import { Logo } from '@/components/brand/logo';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center bg-background px-6 py-16 text-center text-foreground">
      <Logo variant="icon" className="mb-6 h-10" />
      <h1 className="font-heading text-2xl font-bold">Página não encontrada</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Esse endereço não existe no iNutri. Confira o link ou volte para o início.
      </p>
      <Link href="/" className="mt-6 text-sm font-semibold text-primary hover:underline">
        Voltar para o início
      </Link>
    </main>
  );
}
