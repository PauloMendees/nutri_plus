'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { BillingPeriod, CardHolderInfo, CardInput, ChangePlanPreview, PixQrCode, PlanTier } from '@nutri-plus/shared-types';
import { ApiError } from '@/lib/api/client';
import { changePlan, checkoutSubscription, getSubscription, previewChangePlan, startTrial } from '@/lib/api/subscription';
import { SUBSCRIPTION_KEY } from '@/lib/queries/subscription';
import { Button } from '@/components/ui/button';
import { CardForm } from '@/components/billing/card-form';
import { PixPayment } from '@/components/billing/pix-payment';
import { PlanPicker } from '@/components/billing/plan-picker';

type Choice = { plan: PlanTier; period: BillingPeriod };
type Method = 'PIX' | 'CREDIT_CARD';
type Done = { text: string };

const CARD_DECLINED_MESSAGE = 'Cartão recusado. Confira os dados ou tente outro cartão.';
const moneyBrl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const periodLabel = (p: BillingPeriod) => (p === 'MONTHLY' ? 'mês' : 'ano');

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
  const [done, setDone] = useState<Done | null>(null);
  const [changePlanTarget, setChangePlanTarget] = useState<PlanTier | null>(null);
  const [changePix, setChangePix] = useState<PixQrCode | null>(null);
  const [changeChoice, setChangeChoice] = useState<Choice | null>(null);
  const [changePreview, setChangePreview] = useState<ChangePlanPreview | null>(null);

  const isActive = Boolean(data?.status === 'ACTIVE' && !data?.entitlements.isReadOnly);

  useEffect(() => {
    if (changePix && changePlanTarget && data?.plan === changePlanTarget) {
      setDone({ text: 'Upgrade concluído!' });
      setChangePix(null);
      setChangePlanTarget(null);
    }
  }, [changePix, changePlanTarget, data?.plan]);

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

  async function onPickChange(plan: PlanTier, period: BillingPeriod) {
    setLoading(true);
    setError(null);
    try {
      const preview = await previewChangePlan({ plan, period });
      setChangeChoice({ plan, period });
      setChangePreview(preview);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const body = err.body as { message?: string } | null;
        setError(body?.message ?? 'Não foi possível calcular a troca de plano.');
      } else {
        setError('Não foi possível calcular a troca de plano. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  function backToPicker() {
    setChangePreview(null);
    setChangeChoice(null);
    setError(null);
  }

  async function confirmChange() {
    if (!changeChoice) return;
    await onChangePlan(changeChoice.plan, changeChoice.period);
    setChangePreview(null);
    setChangeChoice(null);
  }

  async function onChangePlan(plan: PlanTier, period: BillingPeriod) {
    setLoading(true);
    setError(null);
    try {
      const res = await changePlan({ plan, period });
      if (res.kind === 'SCHEDULED') {
        setDone({ text: `Seu plano muda em ${new Date(res.effectiveDate).toLocaleDateString('pt-BR')}.` });
      } else if (res.method === 'CREDIT_CARD') {
        await queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY });
        setDone({ text: `Upgrade concluído! Você pagou R$ ${res.amount.toLocaleString('pt-BR')}.` });
      } else {
        setChangePlanTarget(plan);
        setChangePix(res.pixQrCode);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const body = err.body as { code?: string; message?: string } | null;
        setError(body?.message ?? 'Não foi possível trocar de plano.');
      } else {
        setError('Não foi possível trocar de plano. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-12 text-center">
        <h1 className="text-xl font-semibold">{done.text}</h1>
        <Button asChild>
          <a href="/">Ir para o painel</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-center text-2xl font-semibold">{isActive ? 'Troque de plano' : 'Escolha seu plano'}</h1>
      {isActive ? (
        <div className="space-y-6">
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
          {changePix ? (
            <div className="mx-auto max-w-sm space-y-4 rounded-lg border p-6 text-center">
              <p className="text-sm text-muted-foreground">Pague a diferença para concluir o upgrade.</p>
              <PixPayment pixQrCode={changePix} />
            </div>
          ) : changePreview ? (
            <div className="mx-auto max-w-sm space-y-4 rounded-lg border p-6">
              {changePreview.kind === 'UPGRADE' ? (
                <p className="text-sm">
                  Você paga <strong>R$ {moneyBrl(changePreview.amountNow)} agora</strong> (proporcional aos dias restantes) e depois{' '}
                  <strong>R$ {moneyBrl(changePreview.recurringValue)}/{periodLabel(changePreview.recurringPeriod)}</strong>. Seu vencimento continua em{' '}
                  <strong>{new Date(changePreview.effectiveDate).toLocaleDateString('pt-BR')}</strong>.
                </p>
              ) : (
                <p className="text-sm">
                  Sem cobrança agora. A partir de <strong>{new Date(changePreview.effectiveDate).toLocaleDateString('pt-BR')}</strong> você paga{' '}
                  <strong>R$ {moneyBrl(changePreview.recurringValue)}/{periodLabel(changePreview.recurringPeriod)}</strong>.
                </p>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" disabled={loading} onClick={confirmChange}>
                  {loading ? 'Processando…' : 'Confirmar troca'}
                </Button>
                <Button variant="ghost" disabled={loading} onClick={backToPicker}>
                  Voltar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <PlanPicker
                currentPlan={data!.plan ?? undefined}
                currentPeriod={data!.billingPeriod ?? undefined}
                onChoose={onPickChange}
                busy={loading}
              />
              <div className="text-center">
                <Button variant="ghost" size="sm" disabled={loading} onClick={() => router.back()}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : !choice ? (
        <div className="space-y-6">
          {data?.onboardedAt === null && (
            <div className="mx-auto max-w-sm space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
              <p className="text-sm text-muted-foreground">Ainda não decidiu? Experimente grátis por 7 dias, sem cartão.</p>
              <Button className="w-full" disabled={trialLoading} onClick={handleStartTrial}>
                {trialLoading ? 'Iniciando…' : 'Começar teste grátis (7 dias)'}
              </Button>
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
            <Button
              variant={method === 'PIX' ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={method === 'PIX'}
              onClick={() => selectMethod('PIX')}
            >
              Pix
            </Button>
            <Button
              variant={method === 'CREDIT_CARD' ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={method === 'CREDIT_CARD'}
              onClick={() => selectMethod('CREDIT_CARD')}
            >
              Cartão
            </Button>
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
                <Button className="w-full" disabled={loading} onClick={generatePix}>
                  {loading ? 'Gerando…' : 'Gerar código Pix'}
                </Button>
              </div>
            )
          ) : (
            <CardForm onSubmit={handleCardSubmit} loading={loading} error={error} />
          )}
          {!pix && (
            <Button variant="ghost" size="sm" onClick={backToPlans}>
              Voltar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
