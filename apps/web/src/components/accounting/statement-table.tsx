'use client';

import type { AccountingStatement, StatementItem } from '@nutri-plus/shared-types';
import { formatBRL } from '@/lib/format/currency';
import { AMOUNT_TEXT_CLASS } from '@/lib/format/transaction-style';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function StatementTable({
  statement,
  onEdit,
}: {
  statement: AccountingStatement;
  onEdit: (item: StatementItem) => void;
}) {
  if (statement.items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhuma transação neste período.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-3 font-medium">Data</th>
            <th className="p-3 font-medium">Descrição</th>
            <th className="p-3 font-medium">Categoria</th>
            <th className="p-3 text-right font-medium">Valor</th>
            <th className="p-3 text-right font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {statement.items.map((item) => {
            const income = item.type === 'INCOME';
            return (
              <tr
                key={item.id}
                onClick={() => onEdit(item)}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
              >
                <td className="whitespace-nowrap p-3 tabular-nums">{formatDate(item.occurredOn)}</td>
                <td className="p-3">{item.description ?? '—'}</td>
                <td className="p-3">
                  {item.category ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                      {item.category.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td
                  className={`p-3 text-right tabular-nums font-medium ${
                    AMOUNT_TEXT_CLASS[item.type]
                  }`}
                >
                  {`${income ? '+' : '-'}${formatBRL(item.amountCents)}`}
                </td>
                <td className="p-3 text-right tabular-nums">{formatBRL(item.balanceCents)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t text-xs text-muted-foreground">
            <td className="p-3" colSpan={4}>
              Saldo anterior
            </td>
            <td className="p-3 text-right tabular-nums">{formatBRL(statement.openingBalanceCents)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
