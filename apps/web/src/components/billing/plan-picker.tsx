'use client';
import { useState } from 'react';
import type { BillingPeriod, PlanTier } from '@nutri-plus/shared-types';
import { PLAN_CATALOG } from '@nutri-plus/shared-types';

const TIERS: PlanTier[] = ['ESSENCIAL', 'PRO'];
const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR')}`;

export function PlanPicker({ onChoose }: { onChoose: (plan: PlanTier, period: BillingPeriod) => void }) {
  const [period, setPeriod] = useState<BillingPeriod>('MONTHLY');
  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-2 text-sm">
        <button aria-pressed={period === 'MONTHLY'} onClick={() => setPeriod('MONTHLY')} className={period === 'MONTHLY' ? 'font-semibold underline' : ''}>Mensal</button>
        <button aria-pressed={period === 'YEARLY'} onClick={() => setPeriod('YEARLY')} className={period === 'YEARLY' ? 'font-semibold underline' : ''}>Anual <span className="text-primary">(2 meses grátis)</span></button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {TIERS.map((tier) => {
          const cfg = PLAN_CATALOG[tier];
          const price = period === 'MONTHLY' ? cfg.monthlyBrl : cfg.yearlyBrl;
          return (
            <div key={tier} className="rounded-lg border p-6 space-y-3">
              <h3 className="text-lg font-semibold">{tier === 'PRO' ? 'Pro' : 'Essencial'}</h3>
              <p className="text-2xl font-bold">{brl(price)}<span className="text-sm font-normal text-muted-foreground">/{period === 'MONTHLY' ? 'mês' : 'ano'}</span></p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>{cfg.aiActionsPerMonth} ações de IA/mês</li>
                <li>{cfg.features.includes('silhueta') ? '✓' : '—'} Silhueta</li>
                <li>{cfg.features.includes('transcription') ? '✓' : '—'} Transcrição</li>
                <li>{cfg.employeeSeats > 0 ? `Até ${cfg.employeeSeats} funcionários` : 'Sem funcionários'}</li>
              </ul>
              <button className="w-full rounded bg-primary text-primary-foreground py-2 text-sm" onClick={() => onChoose(tier, period)}>
                Assinar {tier === 'PRO' ? 'Pro' : 'Essencial'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
