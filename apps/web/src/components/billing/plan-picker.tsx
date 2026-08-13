'use client';
import { useState } from 'react';
import type { BillingPeriod, ChangePlanPreview, PlanTier } from '@nutri-plus/shared-types';
import { PLAN_CATALOG } from '@nutri-plus/shared-types';
import { Button } from '@/components/ui/button';

const TIERS: PlanTier[] = ['ESSENCIAL', 'PRO'];
const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR')}`;
const money = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

export function PlanPicker({
  onChoose,
  currentPlan,
  currentPeriod,
  busy,
  period: periodProp,
  onPeriodChange,
  previews,
  previewsLoading,
}: {
  onChoose: (plan: PlanTier, period: BillingPeriod) => void;
  currentPlan?: PlanTier;
  currentPeriod?: BillingPeriod;
  busy?: boolean;
  // Período controlado (fluxo de troca de plano); se ausente, usa estado interno.
  period?: BillingPeriod;
  onPeriodChange?: (period: BillingPeriod) => void;
  // Preview de valor (autoritativo do server) por plano, exibido dentro do card.
  previews?: Partial<Record<PlanTier, ChangePlanPreview | null>>;
  previewsLoading?: boolean;
}) {
  const [internalPeriod, setInternalPeriod] = useState<BillingPeriod>(currentPeriod ?? 'MONTHLY');
  const period = periodProp ?? internalPeriod;
  const changePeriod = (p: BillingPeriod) => (onPeriodChange ? onPeriodChange(p) : setInternalPeriod(p));
  const unit = period === 'MONTHLY' ? 'mês' : 'ano';
  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-fit items-center gap-1 rounded-full border p-1 text-sm">
        <Button
          variant={period === 'MONTHLY' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={period === 'MONTHLY'}
          onClick={() => changePeriod('MONTHLY')}
        >
          Mensal
        </Button>
        <Button
          variant={period === 'YEARLY' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={period === 'YEARLY'}
          onClick={() => changePeriod('YEARLY')}
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
          const preview = previews?.[tier];
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
                  <span className="text-sm font-medium text-muted-foreground">/{unit}</span>
                </p>
              </div>
              {!isCurrent && currentPlan && (
                <div className="rounded-lg bg-muted/50 p-3 text-xs">
                  {previewsLoading ? (
                    <span className="text-muted-foreground">Calculando valor…</span>
                  ) : preview ? (
                    preview.kind === 'UPGRADE' ? (
                      <span className="text-muted-foreground">
                        <strong className="text-foreground">R$ {money(preview.amountNow)} agora</strong> (proporcional aos dias restantes), depois{' '}
                        <strong className="text-foreground">R$ {money(preview.recurringValue)}/{unit}</strong>. Vencimento mantém {fmtDate(preview.effectiveDate)}.
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Sem cobrança agora. A partir de {fmtDate(preview.effectiveDate)}:{' '}
                        <strong className="text-foreground">R$ {money(preview.recurringValue)}/{unit}</strong>.
                      </span>
                    )
                  ) : null}
                </div>
              )}
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
                <Button type="button" className="mt-auto w-full" variant="outline" size="lg" disabled>
                  Plano atual
                </Button>
              ) : (
                <Button
                  type="button"
                  className="mt-auto w-full"
                  variant={pro ? 'default' : 'outline'}
                  size="lg"
                  disabled={busy}
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
