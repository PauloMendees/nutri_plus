import Link from 'next/link';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <div className="space-y-4 text-center">
      <h2 className="font-heading text-2xl font-bold text-foreground">Confirme seu e-mail</h2>
      <p className="text-sm text-muted-foreground">
        Enviamos um link de confirmação{email ? ' para ' : ''}
        {email && <span className="font-medium text-foreground">{email}</span>}. Abra o e-mail e
        clique no link para ativar sua conta.
      </p>
      <p className="text-sm text-muted-foreground">
        Clicar no link do e-mail já ativa sua conta e entra automaticamente.
      </p>
      <p className="text-sm text-muted-foreground">
        Abriu em outro dispositivo?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">Entrar</Link>
      </p>
    </div>
  );
}
