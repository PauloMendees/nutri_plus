'use client';
import { useState } from 'react';
import type { CardHolderInfo, CardInput } from '@nutri-plus/shared-types';
import { useSubscription } from '@/lib/queries/subscription';
import { cancelSubscription, updatePaymentMethod } from '@/lib/api/subscription';
import { CardForm } from '@/components/billing/card-form';

const STATUS_LABEL: Record<string, string> = {
  TRIALING: 'Em teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  CANCELED: 'Cancelada',
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

export function SubscriptionTab() {
  const { data, refetch } = useSubscription();
  const [editingCard, setEditingCard] = useState(false);
  const [pmLoading, setPmLoading] = useState(false);
  const [pmError, setPmError] = useState<string | null>(null);
  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  async function onCancel() {
    if (!confirm('Cancelar a assinatura? Você mantém o acesso até o fim do período pago.')) return;
    await cancelSubscription();
    await refetch?.();
  }

  async function onCardSubmit(card: CardInput, holderInfo: CardHolderInfo, cpfCnpj: string) {
    setPmLoading(true);
    setPmError(null);
    try {
      await updatePaymentMethod({ method: 'CREDIT_CARD', cpfCnpj, card, holderInfo });
      await refetch?.();
      setEditingCard(false);
    } catch {
      setPmError('Não foi possível atualizar o cartão. Confira os dados e tente novamente.');
    } finally {
      setPmLoading(false);
    }
  }

  async function onSwitchToPix() {
    setPmLoading(true);
    setPmError(null);
    try {
      await updatePaymentMethod({ method: 'PIX' });
      await refetch?.();
    } catch {
      setPmError('Não foi possível mudar para Pix. Tente novamente.');
    } finally {
      setPmLoading(false);
    }
  }

  const paymentMethodLabel =
    data.paymentMethod === 'CREDIT_CARD'
      ? `Cartão •••• ${data.cardLast4} (${data.cardBrand})`
      : data.paymentMethod === 'PIX'
        ? 'Pix'
        : '—';

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-sm">
        <p>
          Plano:{' '}
          <strong>
            {data.plan === 'PRO' ? 'Pro' : data.plan === 'ESSENCIAL' ? 'Essencial' : '—'}
          </strong>{' '}
          {data.billingPeriod ? `(${data.billingPeriod === 'MONTHLY' ? 'mensal' : 'anual'})` : ''}
        </p>
        <p>
          Status: <strong>{STATUS_LABEL[data.status] ?? data.status}</strong>
          {data.isComp ? ' (cortesia)' : ''}
        </p>
        <p>
          Próxima cobrança: {fmt(data.currentPeriodEnd)}
          {data.cancelAtPeriodEnd ? ' (cancelamento agendado)' : ''}
        </p>
      </div>

      <div className="flex gap-2">
        <a href="/assinatura" className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm">
          Trocar plano
        </a>
        {(data.status === 'ACTIVE' || data.status === 'PAST_DUE') && !data.cancelAtPeriodEnd && (
          <button type="button" className="rounded border px-4 py-2 text-sm" onClick={onCancel}>
            Cancelar assinatura
          </button>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Método de pagamento</h4>
        <p className="text-sm">{paymentMethodLabel}</p>
        {editingCard ? (
          <CardForm onSubmit={onCardSubmit} loading={pmLoading} error={pmError} />
        ) : (
          <div className="flex gap-2">
            {data.paymentMethod === 'PIX' && (
              <button
                type="button"
                className="rounded border px-4 py-2 text-sm"
                onClick={() => {
                  setPmError(null);
                  setEditingCard(true);
                }}
              >
                Trocar para cartão
              </button>
            )}
            {data.paymentMethod === 'CREDIT_CARD' && (
              <>
                <button
                  type="button"
                  className="rounded border px-4 py-2 text-sm"
                  onClick={() => {
                    setPmError(null);
                    setEditingCard(true);
                  }}
                >
                  Atualizar cartão
                </button>
                <button
                  type="button"
                  className="rounded border px-4 py-2 text-sm"
                  disabled={pmLoading}
                  onClick={onSwitchToPix}
                >
                  Mudar para Pix
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2">Faturas</h4>
        {data.recentPayments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma fatura ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Método</th>
              </tr>
            </thead>
            <tbody>
              {data.recentPayments.map((p) => (
                <tr key={p.id} className="border-t">
                  <td>{fmt(p.dueDate)}</td>
                  <td>R$ {p.amount.toLocaleString('pt-BR')}</td>
                  <td>{p.status}</td>
                  <td>{p.billingType ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
