'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CtaLink } from './cta-link';

type Billing = 'monthly' | 'yearly';

const PLANS = {
  essencial: {
    name: 'Essencial',
    blurb: 'Para organizar o consultório e acelerar planos.',
    monthly: 59,
    yearly: 590,
    yearlyPerMonth: 49,
    yearlySave: 118,
    includes: [
      'Pacientes ilimitados',
      'Editor de planos + banco de alimentos',
      'IA de planos — até ~30 gerações/mês',
      'App do paciente (paciente não paga)',
      'Agenda',
      'Bioimpedância e evolução',
      'Exportação em PDF',
    ],
    excludes: ['Silhueta', 'Contabilidade', 'IA ilimitada'],
    href: '/signup?plan=essencial',
    cta: 'Começar no Essencial',
    featured: false,
  },
  pro: {
    name: 'Pro',
    blurb: 'Para velocidade máxima e atendimento diferenciado.',
    monthly: 97,
    yearly: 970,
    yearlyPerMonth: 81,
    yearlySave: 194,
    includes: [
      'Tudo do Essencial',
      'IA de planos ilimitada',
      'Silhueta (estimativa por foto)',
      'Contabilidade do consultório',
    ],
    excludes: [] as string[],
    href: '/signup?plan=pro',
    cta: 'Começar no Pro',
    featured: true,
  },
} as const;

export function PricingSection() {
  const [billing, setBilling] = useState<Billing>('monthly');

  return (
    <section id="precos" className="scroll-mt-24 border-t border-border bg-muted/40 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Preço de nutricionista solo. Não de rede de clínicas.
          </h2>
          <p className="mt-3 text-muted-foreground">
            7 dias grátis em qualquer plano. Cancele quando quiser — sem multa e sem fidelidade.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div
            className="inline-flex rounded-xl border border-border bg-background p-1 shadow-sm"
            role="group"
            aria-label="Período de cobrança"
          >
            {(
              [
                { id: 'monthly', label: 'Mensal' },
                { id: 'yearly', label: 'Anual · 2 meses grátis' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setBilling(opt.id)}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  billing === opt.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:gap-8">
          {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map((key) => {
            const plan = PLANS[key];
            const price =
              billing === 'monthly' ? plan.monthly : plan.yearlyPerMonth;
            const priceNote =
              billing === 'monthly'
                ? key === 'essencial'
                  ? 'Menos de R$2 por dia'
                  : 'IA ilimitada + Silhueta'
                : `R$${plan.yearly}/ano · economize R$${plan.yearlySave}`;

            return (
              <div
                key={key}
                className={cn(
                  'relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm sm:p-8',
                  plan.featured
                    ? 'border-primary ring-2 ring-primary/20 lg:scale-[1.02]'
                    : 'border-border',
                )}
              >
                {plan.featured && (
                  <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                    Recomendado
                  </span>
                )}
                <h3 className="font-heading text-xl font-bold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.blurb}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-heading text-4xl font-bold tracking-tight text-foreground">
                    R${price}
                  </span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{priceNote}</p>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.includes.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                  {plan.excludes.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                      <X className="mt-0.5 size-4 shrink-0 opacity-50" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <CtaLink
                  href={plan.href}
                  className="mt-8 w-full justify-center"
                  variant={plan.featured ? 'default' : 'outline'}
                >
                  {plan.cta}
                </CtaLink>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-10 max-w-2xl space-y-2 text-center text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Nos 7 dias você usa o fluxo de verdade.</strong>{' '}
            Não gostou? Cancele antes do fim do trial e não é cobrado. No Pro, Silhueta e IA
            ilimitada entram no plano — sem add-on escondido.
          </p>
          <p className="text-xs">
            Líderes do mercado costumam ficar na casa dos R$90+/mês no plano cheio — nem sempre
            com a simplicidade que o solo precisa.
          </p>
        </div>
      </div>
    </section>
  );
}
