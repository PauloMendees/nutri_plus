'use client';
import { useState } from 'react';
import type { BillingPeriod, PlanTier } from '@nutri-plus/shared-types';
import { PLAN_CATALOG } from '@nutri-plus/shared-types';

const TIERS: PlanTier[] = ['ESSENCIAL', 'PRO'];
const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR')}`;

export function PlanPicker({ onChoose }: { onChoose: (plan: PlanTier, period: BillingPeriod) => void }) {
  const [period, setPeriod] = useState<BillingPeriod>('MONTHLY');
  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-fit items-center gap-1 rounded-full border p-1 text-sm">
        <button
          aria-pressed={period === 'MONTHLY'}
          onClick={() => setPeriod('MONTHLY')}
          className={`rounded-full px-4 py-1 ${period === 'MONTHLY' ? 'bg-primary text-primary-foreground' : ''}`}
        >
          Mensal
        </button>
        <button
          aria-pressed={period === 'YEARLY'}
          onClick={() => setPeriod('YEARLY')}
          className={`rounded-full px-4 py-1 ${period === 'YEARLY' ? 'bg-primary text-primary-foreground' : ''}`}
        >
          Anual <span className="text-xs opacity-80">2 meses grátis</span>
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {TIERS.map((tier) => {
          const cfg = PLAN_CATALOG[tier];
          const price = period === 'MONTHLY' ? cfg.monthlyBrl : cfg.yearlyBrl;
          const pro = tier === 'PRO';
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
              <button
                className={`mt-auto w-full rounded-lg py-2.5 text-sm font-semibold ${pro ? 'bg-primary text-primary-foreground' : 'border'}`}
                onClick={() => onChoose(tier, period)}
              >
                Assinar {pro ? 'Pro' : 'Essencial'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
