'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { BillingPeriod, PlanTier } from '@nutri-plus/shared-types';
import { checkoutSubscription, getSubscription } from '@/lib/api/subscription';
import { SUBSCRIPTION_KEY } from '@/lib/queries/subscription';
import { PlanPicker } from '@/components/billing/plan-picker';
import { Button } from '@/components/ui/button';

export default function AssinaturaPage() {
  // Poll enquanto pendente: após pagar no Asaas o webhook vira o status.
  const { data } = useQuery({ queryKey: SUBSCRIPTION_KEY, queryFn: getSubscription, refetchInterval: 5000 });
  const [choice, setChoice] = useState<{ plan: PlanTier; period: BillingPeriod } | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = data?.status === 'ACTIVE' && !data?.entitlements.isReadOnly;
  const canContinueTrial = data?.status === 'TRIALING' && !data?.entitlements.isReadOnly;

  if (active) {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-12">
        <h1 className="text-xl font-semibold">Assinatura ativa 🎉</h1>
        <p className="text-sm text-muted-foreground">
          Seu plano {data?.plan === 'PRO' ? 'Pro' : 'Essencial'} está ativo.
        </p>
        <Button asChild variant="link" className="rounded-full">
          <Link href="/">Ir para o painel</Link>
        </Button>
      </div>
    );
  }

  async function confirm() {
    if (!choice) return;
    const digits = cpfCnpj.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) {
      setError('Informe um CPF (11) ou CNPJ (14) válido.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { invoiceUrl } = await checkoutSubscription({
        plan: choice.plan,
        period: choice.period,
        cpfCnpj: digits,
      });
      window.location.href = invoiceUrl; // página hospedada do Asaas (Pix/cartão)
    } catch {
      setError('Não foi possível iniciar o pagamento. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Escolha seu plano</h1>
        {canContinueTrial && (
          <p className="text-sm text-muted-foreground">
            Assine agora ou continue com o teste gratuito de 7 dias — sem cartão.
          </p>
        )}
      </div>
      {!choice ? (
        <>
          <PlanPicker onChoose={(plan, period) => setChoice({ plan, period })} />
          {canContinueTrial && (
            <div className="text-center">
              <Button asChild variant="link" className="rounded-full">
                <Link href="/patients">Continuar com o teste gratuito</Link>
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="max-w-sm mx-auto space-y-4 rounded-lg border p-6">
          <p className="text-sm">
            Plano <strong>{choice.plan === 'PRO' ? 'Pro' : 'Essencial'}</strong> —{' '}
            {choice.period === 'MONTHLY' ? 'mensal' : 'anual'}.
          </p>
          <label className="block text-sm">
            CPF/CNPJ
            <input
              aria-label="CPF/CNPJ"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              placeholder="Somente números"
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setChoice(null)}>
              Voltar
            </Button>
            <Button type="button" className="rounded-full" disabled={loading} onClick={confirm}>
              {loading ? 'Redirecionando…' : 'Confirmar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
