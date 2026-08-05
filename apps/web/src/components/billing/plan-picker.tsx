'use client';
import { useState } from 'react';
import type { BillingPeriod, PlanTier } from '@nutri-plus/shared-types';
import { PLAN_CATALOG } from '@nutri-plus/shared-types';
import { Button } from '@/components/ui/button';

const TIERS: PlanTier[] = ['ESSENCIAL', 'PRO'];
const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR')}`;

export function PlanPicker({
  onChoose,
  currentPlan,
  currentPeriod,
}: {
  onChoose: (plan: PlanTier, period: BillingPeriod) => void;
  currentPlan?: PlanTier;
  currentPeriod?: BillingPeriod;
}) {
  const [period, setPeriod] = useState<BillingPeriod>(currentPeriod ?? 'MONTHLY');
  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-fit items-center gap-1 rounded-full border p-1 text-sm">
        <Button
          variant={period === 'MONTHLY' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={period === 'MONTHLY'}
          onClick={() => setPeriod('MONTHLY')}
        >
          Mensal
        </Button>
        <Button
          variant={period === 'YEARLY' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={period === 'YEARLY'}
          onClick={() => setPeriod('YEARLY')}
        >
          Anual <span className="text-xs opacity-80">2 meses grátis</span>
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {TIERS.map((tier) => {
          const cfg = PLAN_CATALOG[tier];
          const price = period === 'MONTHLY' ? cfg.monthlyBrl : cfg.yearlyBrl;
          const pro = tier === 'PRO';
          const isCurrent = tier === currentPlan && period === currentPeriod;
          return (
            <div
              key={tier}
              className={`relative flex flex-col gap-4 rounded-2xl border p-6 ${pro ? 'border-primary shadow-lg ring-1 ring-primary/20' : ''}`}
            >
              {pro && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                  Mais popular
                </span>
              )}
              {isCurrent && (
                <span className="w-fit rounded-full bg-muted px-3 py-0.5 text-xs font-semibold text-muted-foreground">
                  Seu plano atual
                </span>
              )}
              <div>
                <h3 className="text-xl font-bold">{pro ? 'Pro' : 'Essencial'}</h3>
                <p className="mt-1 text-3xl font-extrabold">
                  {brl(price)}
                  <span className="text-sm font-medium text-muted-foreground">/{period === 'MONTHLY' ? 'mês' : 'ano'}</span>
                </p>
              </div>
              <ul className="space-y-2 text-sm">
                <li>✓ Pacientes ilimitados, planos, bioimpedância, agenda</li>
                <li>
                  ✓ <strong>{cfg.aiActionsPerMonth}</strong> ações de IA/mês
                </li>
                <li>{cfg.features.includes('silhueta') ? '✓' : '—'} Silhueta (IA)</li>
                <li>{cfg.features.includes('transcription') ? '✓' : '—'} Transcrição de consulta</li>
                <li>{cfg.employeeSeats > 0 ? `✓ Até ${cfg.employeeSeats} funcionários` : '— Sem funcionários'}</li>
              </ul>
              {isCurrent ? (
                <Button className="mt-auto w-full" variant="outline" size="lg" disabled>
                  Plano atual
                </Button>
              ) : (
                <Button
                  className="mt-auto w-full"
                  variant={pro ? 'default' : 'outline'}
                  size="lg"
                  onClick={() => onChoose(tier, period)}
                >
                  {currentPlan ? `Trocar para ${pro ? 'Pro' : 'Essencial'}` : `Assinar ${pro ? 'Pro' : 'Essencial'}`}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
