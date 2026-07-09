import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Suporte — iNutri',
  description: 'Como obter ajuda com o aplicativo iNutri.',
};

// Public page (no auth) — see PUBLIC_ROUTES in src/lib/auth/route-rules.ts.
// Serves as the App Store / Play "Support URL".

const CONTACT_EMAIL = 'contato@inutri.life';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='mt-8'>
      <h2 className='font-heading text-xl font-semibold text-foreground'>{title}</h2>
      <div className='mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground'>{children}</div>
    </section>
  );
}

export default function SupportPage() {
  const mailto = `mailto:${CONTACT_EMAIL}`;
  return (
    <main className='mx-auto max-w-2xl bg-background px-6 py-12 text-foreground'>
      <h1 className='font-heading text-3xl font-bold'>Suporte</h1>
      <p className='mt-6 text-sm leading-relaxed text-muted-foreground'>
        Precisa de ajuda com o <strong className='text-foreground'>iNutri</strong>? Fale com a
        gente pelo e-mail{' '}
        <a className='font-medium text-primary underline' href={mailto}>
          {CONTACT_EMAIL}
        </a>
        . Respondemos em até 2 dias úteis.
      </p>

      <Section title='Como acesso o aplicativo?'>
        <p>
          O iNutri é o app dos pacientes acompanhados por nutricionistas que usam a plataforma
          iNutri. Para entrar, você recebe um <strong className='text-foreground'>convite do seu
          nutricionista</strong> por e-mail e define sua senha ao aceitá-lo.
        </p>
      </Section>

      <Section title='Esqueci minha senha'>
        <p>
          Na tela de login do app, toque em <strong className='text-foreground'>&ldquo;Esqueci
          minha senha&rdquo;</strong> e siga as instruções enviadas para o seu e-mail.
        </p>
      </Section>

      <Section title='Como excluo minha conta?'>
        <p>
          No app, vá em <strong className='text-foreground'>Configurações → Apagar minha
          conta</strong>. Isso remove seus dados de acesso e libera o seu e-mail. Você também pode
          solicitar a exclusão pelo e-mail acima.
        </p>
      </Section>

      <Section title='Privacidade'>
        <p>
          Consulte como tratamos seus dados na nossa{' '}
          <a className='font-medium text-primary underline' href='/privacy'>
            Política de Privacidade
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
