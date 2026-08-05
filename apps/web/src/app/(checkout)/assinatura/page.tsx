'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { BillingPeriod, CardHolderInfo, CardInput, PixQrCode, PlanTier } from '@nutri-plus/shared-types';
import { ApiError } from '@/lib/api/client';
import { checkoutSubscription, getSubscription, startTrial } from '@/lib/api/subscription';
import { SUBSCRIPTION_KEY } from '@/lib/queries/subscription';
import { CardForm } from '@/components/billing/card-form';
import { PixPayment } from '@/components/billing/pix-payment';
import { PlanPicker } from '@/components/billing/plan-picker';

type Choice = { plan: PlanTier; period: BillingPeriod };
type Method = 'PIX' | 'CREDIT_CARD';

const CARD_DECLINED_MESSAGE = 'Cartão recusado. Confira os dados ou tente outro cartão.';

export default function AssinaturaPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Poll enquanto pendente: após pagar no Asaas o webhook vira o status.
  const { data } = useQuery({ queryKey: SUBSCRIPTION_KEY, queryFn: getSubscription, refetchInterval: 5000 });
  const [choice, setChoice] = useState<Choice | null>(null);
  const [method, setMethod] = useState<Method>('PIX');
  const [pixCpfCnpj, setPixCpfCnpj] = useState('');
  const [pix, setPix] = useState<PixQrCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);

  const active = Boolean(data?.status === 'ACTIVE' && !data?.entitlements.isReadOnly);

  useEffect(() => {
    if (active) router.replace('/');
  }, [active, router]);

  function onChoosePlan(plan: PlanTier, period: BillingPeriod) {
    setChoice({ plan, period });
    setMethod('PIX');
    setPix(null);
    setError(null);
  }

  function selectMethod(next: Method) {
    setMethod(next);
    setError(null);
  }

  function backToPlans() {
    setChoice(null);
    setPix(null);
    setError(null);
  }

  async function handleStartTrial() {
    setTrialLoading(true);
    try {
      await startTrial();
      // Invalida o cache de assinatura antes de navegar: sem isso, `/` serve o
      // cache stale (onboardedAt === null) e o OnboardingGate manda de volta pra cá.
      await queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY });
      router.replace('/');
    } catch {
      setError('Não foi possível iniciar o teste grátis. Tente novamente.');
    } finally {
      setTrialLoading(false);
    }
  }

  async function generatePix() {
    if (!choice) return;
    const digits = pixCpfCnpj.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) {
      setError('Informe um CPF (11) ou CNPJ (14) válido.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await checkoutSubscription({ plan: choice.plan, period: choice.period, cpfCnpj: digits, method: 'PIX' });
      if (res.method === 'PIX') setPix(res.pixQrCode);
    } catch {
      setError('Não foi possível gerar o código Pix. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCardSubmit(card: CardInput, holderInfo: CardHolderInfo, cpfCnpj: string) {
    if (!choice) return;
    setLoading(true);
    setError(null);
    try {
      await checkoutSubscription({ plan: choice.plan, period: choice.period, cpfCnpj, method: 'CREDIT_CARD', card, holderInfo });
      // Mesmo motivo do trial: invalida o cache antes de navegar pra `/`.
      await queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY });
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const body = err.body as { message?: string } | null;
        setError(body?.message ?? CARD_DECLINED_MESSAGE);
      } else {
        setError('Não foi possível processar o pagamento. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (active) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-12 text-center">
        <h1 className="text-xl font-semibold">Assinatura ativa 🎉</h1>
        <p className="text-sm text-muted-foreground">Redirecionando…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-center text-2xl font-semibold">Escolha seu plano</h1>
      {!choice ? (
        <div className="space-y-6">
          {data?.onboardedAt === null && (
            <div className="mx-auto max-w-sm space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
              <p className="text-sm text-muted-foreground">Ainda não decidiu? Experimente grátis por 7 dias, sem cartão.</p>
              <button
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                disabled={trialLoading}
                onClick={handleStartTrial}
              >
                {trialLoading ? 'Iniciando…' : 'Começar teste grátis (7 dias)'}
              </button>
            </div>
          )}
          <PlanPicker onChoose={onChoosePlan} />
        </div>
      ) : (
        <div className="mx-auto max-w-sm space-y-4 rounded-lg border p-6">
          <p className="text-sm">
            Plano <strong>{choice.plan === 'PRO' ? 'Pro' : 'Essencial'}</strong> —{' '}
            {choice.period === 'MONTHLY' ? 'mensal' : 'anual'}.
          </p>
          <div className="mx-auto flex w-fit items-center gap-1 rounded-full border p-1 text-sm">
            <button
              aria-pressed={method === 'PIX'}
              className={`rounded-full px-4 py-1 ${method === 'PIX' ? 'bg-primary text-primary-foreground' : ''}`}
              onClick={() => selectMethod('PIX')}
            >
              Pix
            </button>
            <button
              aria-pressed={method === 'CREDIT_CARD'}
              className={`rounded-full px-4 py-1 ${method === 'CREDIT_CARD' ? 'bg-primary text-primary-foreground' : ''}`}
              onClick={() => selectMethod('CREDIT_CARD')}
            >
              Cartão
            </button>
          </div>
          {method === 'PIX' ? (
            pix ? (
              <PixPayment pixQrCode={pix} />
            ) : (
              <div className="space-y-3">
                <label className="block text-sm">
                  CPF/CNPJ
                  <input
                    aria-label="CPF/CNPJ"
                    className="mt-1 w-full rounded border px-3 py-2"
                    value={pixCpfCnpj}
                    onChange={(e) => setPixCpfCnpj(e.target.value)}
                    placeholder="Somente números"
                  />
                </label>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <button
                  className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  disabled={loading}
                  onClick={generatePix}
                >
                  {loading ? 'Gerando…' : 'Gerar código Pix'}
                </button>
              </div>
            )
          ) : (
            <CardForm onSubmit={handleCardSubmit} loading={loading} error={error} />
          )}
          {!pix && (
            <button className="text-sm" onClick={backToPlans}>
              Voltar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
