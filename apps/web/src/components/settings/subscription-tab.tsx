'use client';
import Link from 'next/link';
import { useSubscription } from '@/lib/queries/subscription';
import { cancelSubscription } from '@/lib/api/subscription';
import { Button } from '@/components/ui/button';

const STATUS_LABEL: Record<string, string> = {
  TRIALING: 'Em teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  CANCELED: 'Cancelada',
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

export function SubscriptionTab() {
  const { data, refetch } = useSubscription();
  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  async function onCancel() {
    if (!confirm('Cancelar a assinatura? Você mantém o acesso até o fim do período pago.')) return;
    await cancelSubscription();
    await refetch?.();
  }

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

      <div className="flex flex-wrap gap-2">
        <Button asChild className="rounded-full">
          <Link href="/assinatura">Trocar plano</Link>
        </Button>
        {(data.status === 'ACTIVE' || data.status === 'PAST_DUE') && !data.cancelAtPeriodEnd && (
          <Button type="button" variant="outline" className="rounded-full" onClick={onCancel}>
            Cancelar assinatura
          </Button>
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
