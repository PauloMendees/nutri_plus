import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import {
  Clock,
  FileText,
  Layers,
  Smartphone,
  Sparkles,
  Camera,
  Calendar,
  LineChart,
  Calculator,
  Wallet,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CtaLink } from './cta-link';
import { marketingAssets } from './marketing-assets';
import {
  DashboardMockup,
  PatientAppMockup,
  SilhuetaMockup,
} from './product-mockups';

/** Below-the-fold / interactive pieces — keep them out of the initial marketing JS. */
const PricingSection = dynamic(
  () => import('./pricing-section').then((m) => m.PricingSection),
  {
    loading: () => (
      <section id="precos" className="scroll-mt-24 border-t border-border bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto h-10 max-w-md animate-pulse rounded-lg bg-muted" />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="h-80 animate-pulse rounded-2xl bg-muted" />
            <div className="h-80 animate-pulse rounded-2xl bg-muted" />
          </div>
        </div>
      </section>
    ),
  },
);

const StickyMobileCta = dynamic(() =>
  import('./sticky-mobile-cta').then((m) => m.StickyMobileCta),
);

const FAQ = [
  {
    q: 'A IA vai padronizar meus pacientes?',
    a: 'Não. A IA observa os dados únicos de cada paciente — metas, restrições, preferências e o que você registra no acompanhamento — para montar um ponto de partida personalizado, não um cardápio genérico. Você edita, ajusta e finaliza. A conduta continua sendo sua.',
  },
  {
    q: 'Sete dias são suficientes?',
    a: 'Sim, quando o teste acompanha a rotina: um ou dois pacientes, um plano com IA, o aplicativo liberado e, no Pro, uma Silhueta. Não é preciso conhecer cada tela.',
  },
  {
    q: 'O paciente paga alguma coisa?',
    a: 'Não. O aplicativo está incluso. Quem assina é o nutricionista.',
  },
  {
    q: 'A Silhueta substitui a bioimpedância?',
    a: 'Não. É uma estimativa por foto, com consentimento, útil para tendência e engajamento. Não é diagnóstico e não deve ser tratada como equivalente a outros métodos.',
  },
  {
    q: 'E a LGPD e as fotos do paciente?',
    a: 'A Silhueta exige consentimento. As fotos servem à estimativa e não ficam armazenadas no iNutri. Há política de privacidade e controles de conta.',
  },
  {
    q: 'É fácil cancelar?',
    a: 'Sim. Sem fidelidade e sem precisar falar com um comercial.',
  },
  {
    q: 'Já uso outro software. Vale a pena migrar?',
    a: 'Se você paga por telas que quase não utiliza — ou ainda trabalha entre PDF e WhatsApp — o período de teste mostra, na prática, se o iNutri devolve tempo.',
  },
  {
    q: 'Funciona no atendimento online?',
    a: 'Sim. O plano no aplicativo e a Silhueta por foto também atendem quem trabalha à distância.',
  },
] as const;

function SectionHeading({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto max-w-2xl text-center', className)}>
      <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">{subtitle}</p>
      ) : null}
    </div>
  );
}

function HeroVisual() {
  if (marketingAssets.heroDashboard) {
    return (
      <div className="relative">
        <Image
          src={marketingAssets.heroDashboard}
          alt="Painel do iNutri com planos alimentares"
          width={1200}
          height={750}
          className="rounded-xl border border-border shadow-2xl shadow-[#0A5C45]/15"
          priority
        />
        {marketingAssets.patientApp ? (
          <div className="absolute -bottom-6 -right-2 w-[28%] sm:-right-4 sm:w-[26%]">
            <Image
              src={marketingAssets.patientApp}
              alt="App do paciente iNutri"
              width={400}
              height={800}
              className="rounded-2xl border-4 border-[#0f1714] shadow-xl"
            />
          </div>
        ) : (
          <div className="absolute -bottom-8 -right-1 w-[38%] sm:-right-4 sm:w-[34%]">
            <PatientAppMockup />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <DashboardMockup />
      <div className="absolute -bottom-8 -right-1 w-[38%] sm:-bottom-10 sm:-right-4 sm:w-[34%]">
        <PatientAppMockup />
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* Announce bar */}
      <div className="bg-[#0A5C45] px-4 py-2 text-center text-xs font-medium text-white sm:text-sm">
        7 dias grátis · Sem fidelidade · Paciente usa o app sem pagar
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <Link href="/" aria-label="iNutri — início">
            <Logo variant="full" className="h-7 sm:h-8" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#como-funciona" className="hover:text-foreground">
              Como funciona
            </a>
            <a href="#pilares" className="hover:text-foreground">
              Recursos
            </a>
            <a href="#precos" className="hover:text-foreground">
              Preços
            </a>
            <a href="#faq" className="hover:text-foreground">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'text-muted-foreground',
              )}
            >
              Entrar
            </Link>
            <CtaLink size="sm" className="h-9 px-3 text-xs sm:text-sm">
              Testar grátis
            </CtaLink>
          </div>
        </div>
      </header>

      <main className="pb-20 md:pb-0">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(20,191,166,0.12),_transparent_55%)]"
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:items-center lg:gap-12 lg:py-20">
            <div>
              <p className="text-sm font-semibold text-primary">
                Feito para nutricionistas que atendem sozinhos
              </p>
              <h1 className="mt-3 font-heading text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
                Menos tempo no plano.
                <br />
                <span className="text-[#0A5C45]">Mais tempo no consultório.</span>
              </h1>
              {/* Short sub: keeps first view light; long Word/Excel line lived here before. */}
              <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg">
                Monte planos com <strong className="text-foreground">IA</strong>, compartilhe no{' '}
                <strong className="text-foreground">app do paciente</strong> e acompanhe o
                atendimento em um só fluxo.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <CtaLink>Começar 7 dias grátis</CtaLink>
                <a
                  href="#como-funciona"
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'lg' }),
                    'hidden h-11 px-6 text-sm font-semibold md:inline-flex',
                  )}
                >
                  Ver como funciona
                  <ArrowRight className="size-4" />
                </a>
              </div>
              {/* Mobile: one thin trust line. Desktop: full risk-reversal + control message. */}
              <p className="mt-3 text-xs text-muted-foreground md:hidden">
                Sem fidelidade · Cancele quando quiser
              </p>
              <p className="mt-3 hidden text-xs text-muted-foreground sm:text-sm md:block">
                Sem fidelidade · Cancele quando quiser · A IA acelera —{' '}
                <strong className="font-medium text-foreground">você decide</strong> o plano
              </p>

              <ul className="mt-8 hidden grid-cols-2 gap-3 text-sm md:grid">
                {[
                  'A partir de R$49/mês · menos de R$2/dia',
                  'App do paciente incluso',
                  'IA com dados de cada paciente',
                  'Silhueta no Pro',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-6 hidden items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground md:inline-flex">
                Em lançamento — o essencial do consultório: plano, paciente e rotina
              </p>
            </div>

            <div className="relative pb-10 sm:pb-12">
              <HeroVisual />
            </div>
          </div>
        </section>

        {/* Pain */}
        <section className="border-t border-border bg-muted/30 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              title="Depois da consulta, o trabalho continua. Entre uma e outra, o paciente se afasta."
              subtitle="Você se formou para cuidar de pessoas — não para passar as noites em planilhas, reescrever cardápios e recuperar conversas no WhatsApp."
            />
            <p className="mx-auto mt-6 max-w-xl text-center text-sm font-medium text-secondary-foreground sm:text-base">
              Uma consulta bem feita não deveria se transformar em mais uma hora de trabalho
              invisível em casa.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-6">
              {[
                {
                  icon: Clock,
                  title: 'O plano que ocupa a noite',
                  body: 'Montar o cardápio, ajustar os macronutrientes, gerar o PDF e reenviar. O atendimento termina; o trabalho, não.',
                },
                {
                  icon: FileText,
                  title: 'O paciente que se afasta',
                  body: 'O plano permanece em um PDF no e-mail. Fora da consulta, o contexto se perde — e a adesão enfraquece.',
                },
                {
                  icon: Layers,
                  title: 'Software caro demais para o solo',
                  body: 'Você paga o preço de uma clínica grande por telas e módulos que o dia a dia quase não utiliza.',
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
                >
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <card.icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="mt-4 font-heading text-lg font-semibold text-foreground">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <p className="mb-4 font-medium text-foreground">
                O iNutri devolve tempo e continuidade ao consultório solo.
              </p>
              <CtaLink>Quero recuperar meu tempo</CtaLink>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="como-funciona" className="scroll-mt-24 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              title="Do cadastro ao plano no celular do paciente — em minutos, não em horas."
            />
            <ol className="mt-12 grid gap-6 sm:grid-cols-3">
              {[
                {
                  n: '1',
                  title: 'Cadastre o paciente',
                  body: 'Dados, metas e preferências ficam no mesmo lugar. Sem planilha à parte.',
                },
                {
                  n: '2',
                  title: 'Gere o plano com IA e valide com o seu critério',
                  body: 'A IA usa o perfil daquele paciente para montar um rascunho sólido. Você edita, personaliza e decide. A IA sugere. Você conduz.',
                },
                {
                  n: '3',
                  title: 'Disponibilize no app do paciente',
                  body: 'O paciente vê o plano no celular. Você acompanha a evolução e o histórico sem procurar conversas e prints no WhatsApp.',
                },
              ].map((step) => (
                <li
                  key={step.n}
                  className="relative rounded-2xl border border-border bg-card p-6 shadow-sm"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-[#0A5C45] font-heading text-sm font-bold text-white">
                    {step.n}
                  </span>
                  <h3 className="mt-4 font-heading text-lg font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-10 text-center">
              <CtaLink>Criar minha conta grátis</CtaLink>
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section id="pilares" className="scroll-mt-24 border-t border-border bg-muted/30 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              title="O essencial do consultório solo, em um só fluxo."
              subtitle="Três pilares. Um caminho contínuo. Sem improvisar entre planilha, PDF e várias abas abertas."
            />

            <div className="mt-12 space-y-10">
              {/* Pilar 1 */}
              <div className="grid items-center gap-8 rounded-2xl border border-border bg-card p-6 shadow-sm lg:grid-cols-2 lg:p-8">
                <div>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Sparkles className="size-5" aria-hidden />
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary">
                    Pilar 1 · Planos com IA
                  </p>
                  <h3 className="mt-1 font-heading text-2xl font-bold text-foreground">
                    Do rascunho ao PDF em uma fração do tempo.
                  </h3>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {[
                      'Considera metas, restrições e preferências de cada paciente',
                      'Monta um rascunho alinhado ao perfil — você ajusta no editor',
                      'Banco de alimentos com informações nutricionais',
                      'Exportação em PDF profissional quando precisar',
                    ].map((b) => (
                      <li key={b} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-sm font-medium text-foreground">
                    Energia no raciocínio clínico — não na digitação.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Essencial: até 30 gerações/mês · Pro: até 200 gerações/mês
                  </p>
                </div>
                <DashboardMockup className="shadow-lg" />
              </div>

              {/* Pilar 2 */}
              <div className="grid items-center gap-8 rounded-2xl border border-border bg-card p-6 shadow-sm lg:grid-cols-2 lg:p-8">
                <div className="order-2 flex justify-center lg:order-1">
                  {marketingAssets.patientApp ? (
                    <Image
                      src={marketingAssets.patientApp}
                      alt="App do paciente com o plano alimentar"
                      width={280}
                      height={560}
                      className="rounded-[1.75rem] border-[6px] border-[#0f1714] shadow-xl"
                    />
                  ) : (
                    <PatientAppMockup />
                  )}
                </div>
                <div className="order-1 lg:order-2">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Smartphone className="size-5" aria-hidden />
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary">
                    Pilar 2 · App do paciente
                  </p>
                  <h3 className="mt-1 font-heading text-2xl font-bold text-foreground">
                    O plano deixa de ficar esquecido no e-mail.
                  </h3>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {[
                      'O paciente acessa o plano no celular',
                      'Menos pedidos para reenviar o PDF',
                      'Mais presença e clareza entre as consultas',
                      'Uma experiência que eleva a percepção do seu atendimento',
                    ].map((b) => (
                      <li key={b} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-sm font-medium text-foreground">
                    O consultório permanece presente depois que a consulta termina.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Incluso em todos os planos · paciente não paga
                  </p>
                </div>
              </div>

              {/* Pilar 3 */}
              <div className="grid items-center gap-8 rounded-2xl border border-border bg-card p-6 shadow-sm lg:grid-cols-2 lg:p-8">
                <div>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Camera className="size-5" aria-hidden />
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary">
                    Pilar 3 · Silhueta
                  </p>
                  <h3 className="mt-1 font-heading text-2xl font-bold text-foreground">
                    Estimativa de composição corporal por foto.
                  </h3>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {[
                      'Fluxo com consentimento explícito',
                      'Fotos usadas na estimativa e não armazenadas no iNutri',
                      'Relatório de tendência do mesmo paciente (Silhueta × Silhueta)',
                      'Transparência: estimativa, não diagnóstico',
                    ].map((b) => (
                      <li key={b} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-sm font-medium text-foreground">
                    Aproxima o paciente e enriquece o acompanhamento — com ética e clareza.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Exclusivo do Pro · não substitui bioimpedância ou DEXA
                  </p>
                </div>
                {marketingAssets.silhueta ? (
                  <Image
                    src={marketingAssets.silhueta}
                    alt="Relatório Silhueta no iNutri"
                    width={640}
                    height={400}
                    className="rounded-xl border border-border shadow-lg"
                  />
                ) : (
                  <SilhuetaMockup />
                )}
              </div>
            </div>

            {/* Support features */}
            <div className="mt-10">
              <p className="text-center text-sm font-medium text-muted-foreground">
                Também no dia a dia
              </p>
              <ul className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {[
                  { icon: Calendar, label: 'Agenda' },
                  { icon: LineChart, label: 'Bioimpedância e evolução' },
                  { icon: Calculator, label: 'Metas e cálculos' },
                  { icon: Wallet, label: 'Contabilidade (Pro)' },
                ].map((f) => (
                  <li
                    key={f.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground sm:text-sm"
                  >
                    <f.icon className="size-3.5 text-primary" aria-hidden />
                    {f.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 7-day plan */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              title="Um teste de rotina — não um passeio pelas telas."
              subtitle="Nos sete dias grátis, use o iNutri de verdade no consultório."
            />
            <div className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              {[
                {
                  day: 'Dia 1',
                  body: 'Crie conta, cadastre 1 paciente, gere 1 plano com IA e ajuste.',
                },
                {
                  day: 'Dias 2–3',
                  body: 'Libere o app para o paciente (ou use em modo demonstração).',
                },
                {
                  day: 'Dias 4–7',
                  body: 'Use agenda e evolução; no Pro, rode uma Silhueta com consentimento.',
                },
              ].map((row, i) => (
                <div
                  key={row.day}
                  className={cn(
                    'flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6',
                    i > 0 && 'border-t border-border',
                  )}
                >
                  <span className="shrink-0 font-heading text-sm font-bold text-primary sm:w-24">
                    {row.day}
                  </span>
                  <p className="text-sm text-muted-foreground">{row.body}</p>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-6 max-w-lg text-center text-sm text-muted-foreground">
              Se ao fim da semana o iNutri{' '}
              <strong className="text-foreground">não devolver tempo</strong>, cancele. Sem
              complicação.
            </p>
            <div className="mt-6 text-center">
              <CtaLink>Iniciar meus 7 dias</CtaLink>
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section className="border-t border-border bg-muted/30 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading title="Feito para quem atende. Não para quem acumula ferramentas." />
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-primary/20 bg-card p-6 shadow-sm">
                <h3 className="font-heading text-lg font-semibold text-[#0A5C45]">Para quem é</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                  {[
                    'Nutricionista solo ou com rotina enxuta',
                    'Quem monta vários planos por semana e sente o peso operacional',
                    'Quem atende presencialmente, online ou de forma híbrida e quer o paciente no app',
                    'Quem usa a IA como acelerador, não como substituto do critério clínico',
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h3 className="font-heading text-lg font-semibold text-foreground">Para quem não é</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                  {[
                    'Clínicas que precisam de ERP hospitalar completo',
                    'Quem só quer tabela de alimentos offline, sem acompanhamento',
                    'Quem espera que a IA substitua conduta e julgamento clínico',
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Compare */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading title="Menos software. Mais resultado por real investido." />

            {/* Desktop table */}
            <div className="mt-10 hidden overflow-hidden rounded-2xl border border-border md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground" />
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      Planilhas / PDF solto
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      Softwares “tudo e mais um pouco”
                    </th>
                    <th className="px-4 py-3 font-heading font-bold text-[#0A5C45]">iNutri</th>
                  </tr>
                </thead>
                <tbody className="bg-card">
                  {[
                    ['Tempo no plano', 'Alto', 'Médio', 'Baixo — IA + editor'],
                    ['App do paciente', 'Não', 'Sim, em geral', 'Sim · gratuito para o paciente'],
                    ['Avaliação por foto', 'Não', 'Em planos caros', 'Silhueta no Pro'],
                    ['Preço solo', 'Gratuito, mas consome noites', '~R$90+/mês nos líderes', 'A partir de R$49/mês'],
                    ['Curva de aprendizado', 'Desorganizada', 'Exigente', 'Enxuta, feita para o atendimento'],
                  ].map((row) => (
                    <tr key={row[0]} className="border-t border-border">
                      <th className="px-4 py-3 font-medium text-foreground">{row[0]}</th>
                      <td className="px-4 py-3 text-muted-foreground">{row[1]}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row[2]}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="mt-8 space-y-3 md:hidden">
              {[
                { label: 'Tempo no plano', value: 'Baixo — IA + editor' },
                { label: 'App do paciente', value: 'Sim · gratuito para o paciente' },
                { label: 'Avaliação por foto', value: 'Silhueta no Pro' },
                { label: 'Preço solo', value: 'A partir de R$49/mês' },
                { label: 'Curva de aprendizado', value: 'Enxuta, feita para o atendimento' },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <span className="text-sm text-muted-foreground">{row.label}</span>
                  <span className="text-right text-sm font-semibold text-foreground">{row.value}</span>
                </div>
              ))}
            </div>

            <p className="mx-auto mt-8 max-w-lg text-center text-sm text-muted-foreground">
              Você não precisa do software mais antigo do mercado.
              <br />
              Precisa do que <strong className="text-foreground">devolve o seu tempo</strong>.
            </p>
            <div className="mt-6 text-center">
              <CtaLink>Experimentar o iNutri grátis</CtaLink>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <PricingSection />

        {/* After click */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading title="Começar é simples. Voltar à planilha, nem tanto." />
            <ol className="mx-auto mt-10 flex max-w-3xl flex-col gap-4 sm:flex-row sm:gap-6">
              {[
                'Crie sua conta em poucos minutos',
                'Cadastre um paciente (pode ser de teste)',
                'Gere um plano com IA e veja o app do paciente',
              ].map((text, i) => (
                <li
                  key={text}
                  className="flex flex-1 flex-col items-center rounded-2xl border border-border bg-card p-5 text-center shadow-sm"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 font-heading text-sm font-bold text-primary">
                    {i + 1}
                  </span>
                  <p className="mt-3 text-sm font-medium text-foreground">{text}</p>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Sem reunião comercial. Sem agendar uma demonstração para ver o básico.
            </p>
            <div className="mt-6 text-center">
              <CtaLink>Criar conta em minutos</CtaLink>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 border-t border-border bg-muted/30 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionHeading title="Perguntas que nutricionistas fazem antes de testar" />
            <div className="mt-10 space-y-3">
              {FAQ.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-xl border border-border bg-card px-4 py-1 shadow-sm open:pb-4"
                >
                  <summary className="cursor-pointer list-none py-3 font-heading text-sm font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between gap-3">
                      {item.q}
                      <span
                        className="text-muted-foreground transition group-open:rotate-45"
                        aria-hidden
                      >
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="pr-6 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
            <div className="mt-10 text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                Ainda com dúvida? O período de teste responde na prática — sem compromisso.
              </p>
              <CtaLink>Testar sem compromisso</CtaLink>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div
            className="absolute inset-0 bg-gradient-to-br from-[#0A5C45] via-[#0E7A5C] to-[#14BFA6]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Sua próxima consulta não precisa ocupar a sua noite.
            </h2>
            <p className="mt-4 text-base text-white/85 sm:text-lg">
              Teste por sete dias. Monte um plano com IA, coloque o paciente no app e avalie a
              diferença — sem compromisso.
            </p>
            <div className="mt-8 flex justify-center">
              <CtaLink className="h-12 bg-white px-8 text-[#0A5C45] hover:bg-white/90 hover:text-[#0A5C45]">
                Garantir meus 7 dias grátis
              </CtaLink>
            </div>
            <p className="mt-4 text-sm text-white/75">
              Cancele quando quiser · Paciente grátis · Você no comando do plano
            </p>
            <p className="mt-6 text-xs text-white/60">
              Feito no Brasil, para o nutricionista brasileiro. Privacidade e transparência no uso
              de IA. Em lançamento — pensado para o dia a dia do consultório solo.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div>
            <Logo variant="full" className="h-7" />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
              iNutri é ferramenta de apoio ao nutricionista. Não substitui julgamento clínico,
              diagnóstico médico ou exames. Silhueta é estimativa por foto e não substitui métodos
              de avaliação clínica consolidados.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <a href="#como-funciona" className="hover:text-foreground">
              Como funciona
            </a>
            <a href="#precos" className="hover:text-foreground">
              Preços
            </a>
            <a href="#faq" className="hover:text-foreground">
              FAQ
            </a>
            <Link href="/suporte" className="hover:text-foreground">
              Suporte
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Entrar
            </Link>
          </nav>
        </div>
        <p className="mx-auto mt-8 max-w-6xl px-4 text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} iNutri
        </p>
      </footer>

      <StickyMobileCta />
    </div>
  );
}
