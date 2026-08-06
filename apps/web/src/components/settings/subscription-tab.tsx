'use client';
import { useState } from 'react';
import type { CardHolderInfo, CardInput } from '@nutri-plus/shared-types';
import { useSubscription } from '@/lib/queries/subscription';
import { cancelSubscription, updatePaymentMethod } from '@/lib/api/subscription';
import { CardForm } from '@/components/billing/card-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATUS_LABEL: Record<string, string> = {
  TRIALING: 'Em teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  CANCELED: 'Cancelada',
};
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: 'Pago',
  RECEIVED: 'Pago',
  PENDING: 'Pendente',
  OVERDUE: 'Vencido',
  REFUNDED: 'Estornado',
};
const BILLING_TYPE_LABEL: Record<string, string> = { PIX: 'Pix', CREDIT_CARD: 'Cartão', BOLETO: 'Boleto' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

export function SubscriptionTab() {
  const { data, refetch } = useSubscription();
  const [editingCard, setEditingCard] = useState(false);
  const [confirmPix, setConfirmPix] = useState(false);
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
        <Button asChild>
          <a href="/assinatura">Trocar plano</a>
        </Button>
        {(data.status === 'ACTIVE' || data.status === 'PAST_DUE') && !data.cancelAtPeriodEnd && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar assinatura
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Método de pagamento</h4>
        <p className="text-sm">{paymentMethodLabel}</p>
        <div className="flex gap-2">
          {data.paymentMethod === 'PIX' && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPmError(null);
                setEditingCard(true);
              }}
            >
              Trocar para cartão
            </Button>
          )}
          {data.paymentMethod === 'CREDIT_CARD' && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPmError(null);
                  setEditingCard(true);
                }}
              >
                Atualizar cartão
              </Button>
              <Button type="button" variant="outline" disabled={pmLoading} onClick={() => setConfirmPix(true)}>
                Mudar para Pix
              </Button>
            </>
          )}
        </div>
      </div>

      <Dialog open={confirmPix} onOpenChange={setConfirmPix}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mudar para Pix?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O Pix não auto-renova; você recebe uma cobrança a cada ciclo.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmPix(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setConfirmPix(false);
                await onSwitchToPix();
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingCard} onOpenChange={setEditingCard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cartão</DialogTitle>
          </DialogHeader>
          <CardForm onSubmit={onCardSubmit} loading={pmLoading} error={pmError} />
        </DialogContent>
      </Dialog>

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
                  <td>{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</td>
                  <td>{p.billingType ? (BILLING_TYPE_LABEL[p.billingType] ?? p.billingType) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
