import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidade — iNutri',
  description: 'Como o iNutri coleta, usa e protege seus dados pessoais e de saúde.',
};

// Public page (no auth) — see PUBLIC_ROUTES in src/lib/auth/route-rules.ts.
// Required by the Apple App Store / Google Play for the patient app.

const UPDATED_AT = '9 de julho de 2026';
const CONTACT_EMAIL = 'privacidade@inutri.life';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='mt-8'>
      <h2 className='font-heading text-xl font-semibold text-foreground'>{title}</h2>
      <div className='mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground'>{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className='mx-auto max-w-2xl bg-background px-6 py-12 text-foreground'>
      <h1 className='font-heading text-3xl font-bold'>Política de Privacidade</h1>
      <p className='mt-2 text-sm text-muted-foreground'>
        iNutri · Última atualização: {UPDATED_AT}
      </p>

      <p className='mt-6 text-sm leading-relaxed text-muted-foreground'>
        Esta Política explica como o <strong className='text-foreground'>iNutri</strong> (o
        &ldquo;aplicativo&rdquo;), plataforma de acompanhamento nutricional, coleta, usa,
        compartilha e protege seus dados pessoais e de saúde. Ao usar o aplicativo, você concorda
        com as práticas descritas abaixo. Tratamos seus dados em conformidade com a Lei Geral de
        Proteção de Dados (LGPD — Lei nº 13.709/2018).
      </p>

      <Section title='1. Quais dados coletamos'>
        <ul className='list-disc space-y-1 pl-5'>
          <li>
            <strong className='text-foreground'>Dados de conta:</strong> nome e e-mail, usados para
            criar e autenticar seu acesso.
          </li>
          <li>
            <strong className='text-foreground'>Dados de saúde e corporais (dados sensíveis):</strong>{' '}
            peso, percentual de gordura, massa muscular e magra, medidas de bioimpedância e
            circunferências, quando registrados por você ou pelo seu nutricionista.
          </li>
          <li>
            <strong className='text-foreground'>Conteúdo do acompanhamento:</strong> planos
            alimentares, avaliações e mensagens enviadas ao assistente &ldquo;Fora de casa&rdquo;.
          </li>
          <li>
            <strong className='text-foreground'>Dados técnicos mínimos:</strong> informações
            necessárias ao funcionamento (ex.: identificadores de sessão).
          </li>
        </ul>
      </Section>

      <Section title='2. Como e por que usamos seus dados'>
        <ul className='list-disc space-y-1 pl-5'>
          <li>Exibir sua evolução, planos alimentares e avaliações no aplicativo.</li>
          <li>Permitir que você registre medições (quando o seu nutricionista habilitar).</li>
          <li>Conectar você ao nutricionista responsável pelo seu acompanhamento.</li>
          <li>
            Gerar sugestões do assistente &ldquo;Fora de casa&rdquo;, quando você o utiliza.
          </li>
        </ul>
      </Section>

      <Section title='3. Base legal (LGPD)'>
        <p>
          Tratamos seus dados para a execução do serviço que você contrata/utiliza e mediante o seu
          consentimento. Dados de saúde são dados pessoais sensíveis (art. 11 da LGPD) e são
          tratados exclusivamente para a finalidade de acompanhamento nutricional descrita nesta
          Política.
        </p>
      </Section>

      <Section title='4. Com quem compartilhamos'>
        <ul className='list-disc space-y-1 pl-5'>
          <li>
            <strong className='text-foreground'>Seu nutricionista</strong> (o profissional que
            convidou você), que acessa seus dados para prestar o acompanhamento.
          </li>
          <li>
            <strong className='text-foreground'>Provedores de infraestrutura</strong> que operam sob
            nossas instruções: Supabase (banco de dados, autenticação e armazenamento) e serviços de
            hospedagem.
          </li>
          <li>
            <strong className='text-foreground'>Provedor de IA</strong> (OpenAI), que processa o
            texto e o contexto enviados ao assistente &ldquo;Fora de casa&rdquo; para gerar a
            resposta.
          </li>
        </ul>
        <p>
          <strong className='text-foreground'>Não vendemos</strong> seus dados nem os usamos para
          publicidade.
        </p>
      </Section>

      <Section title='5. Armazenamento e segurança'>
        <p>
          Seus dados são armazenados em servidores gerenciados (Supabase) com transmissão
          criptografada (HTTPS) e controle de acesso por perfil. Adotamos medidas técnicas e
          organizacionais razoáveis para proteger seus dados contra acesso não autorizado.
        </p>
      </Section>

      <Section title='6. Retenção'>
        <p>
          Mantemos seus dados enquanto sua conta estiver ativa ou conforme necessário para prestar o
          serviço e cumprir obrigações legais. Você pode solicitar a exclusão a qualquer momento.
        </p>
      </Section>

      <Section title='7. Seus direitos'>
        <p>Nos termos da LGPD, você pode a qualquer momento solicitar:</p>
        <ul className='list-disc space-y-1 pl-5'>
          <li>acesso, correção e atualização dos seus dados;</li>
          <li>exclusão dos seus dados e da sua conta;</li>
          <li>portabilidade e informações sobre o compartilhamento;</li>
          <li>revogação do consentimento.</li>
        </ul>
        <p>
          Para exercer esses direitos, entre em contato pelo e-mail{' '}
          <a className='font-medium text-primary underline' href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title='8. Exclusão da conta'>
        <p>
          Você pode apagar sua conta diretamente no aplicativo, em{' '}
          <strong className='text-foreground'>Configurações → Apagar minha conta</strong>, o que
          remove seus dados de acesso e libera o seu e-mail. Também é possível solicitar a exclusão
          pelo e-mail de contato.
        </p>
      </Section>

      <Section title='9. Menores de idade'>
        <p>
          O aplicativo é destinado a maiores de 18 anos. O acompanhamento de menores deve ser feito
          com o consentimento e sob a responsabilidade de um responsável legal, em conjunto com o
          nutricionista.
        </p>
      </Section>

      <Section title='10. Alterações nesta Política'>
        <p>
          Podemos atualizar esta Política periodicamente. Alterações relevantes serão indicadas pela
          data de &ldquo;Última atualização&rdquo; no topo desta página.
        </p>
      </Section>

      <Section title='11. Contato'>
        <p>
          Dúvidas sobre esta Política ou sobre o tratamento dos seus dados? Fale com o nosso
          encarregado de dados pelo e-mail{' '}
          <a className='font-medium text-primary underline' href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
