'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ADMIN_PLAN_LABELS, type AdminPatientRow } from '@nutri-plus/shared-types';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAdminDate } from '@/lib/admin/labels';
import { INVITE_STATUS_LABELS } from '@/lib/patients/labels';
import { useAdminNutritionist } from '@/lib/queries/admin';

// Tabela de pacientes do painel admin (aba Pacientes e detalhe da nutricionista).
export function AdminPatientsTable({
  patients,
  showNutritionist = false,
  emptyMessage = 'Nenhum paciente cadastrado.',
}: {
  patients: AdminPatientRow[];
  showNutritionist?: boolean;
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-semibold">Paciente</th>
            <th className="px-4 py-3 font-semibold">E-mail</th>
            <th className="px-4 py-3 font-semibold">Telefone</th>
            {showNutritionist && <th className="px-4 py-3 font-semibold">Nutricionista</th>}
            <th className="px-4 py-3 font-semibold">Status do app</th>
            <th className="px-4 py-3 font-semibold">Cadastro</th>
          </tr>
        </thead>
        <tbody>
          {patients.length === 0 ? (
            <tr>
              <td colSpan={showNutritionist ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            patients.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-semibold">
                  <span className="block max-w-[14rem] truncate" title={p.name}>{p.name}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="block max-w-[16rem] truncate" title={p.email ?? undefined}>{p.email ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.phone ?? '—'}</td>
                {showNutritionist && <td className="px-4 py-3">{p.nutritionistName}</td>}
                <td className="px-4 py-3">{INVITE_STATUS_LABELS[p.inviteStatus]}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatAdminDate(p.createdAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// backHref reabre o painel com os filtros de onde se veio (ver lib/admin/panel-url).
export function AdminNutritionistDetail({ id, backHref = '/admin' }: { id: string; backHref?: string }) {
  const query = useAdminNutritionist(id);
  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError || !query.data) {
    return <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Nutricionista não encontrada.</p>;
  }
  const { nutritionist: n, patients } = query.data;
  return (
    <div className="space-y-5">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Voltar para o painel
      </Link>
      <div className="space-y-1 rounded-xl border bg-card p-5">
        <h1 className="font-heading text-2xl font-bold">{n.name}</h1>
        <p className="text-sm text-muted-foreground">
          {n.email} · {n.phone ?? 'sem telefone'}
        </p>
        <p className="text-sm">
          Plano: <strong>{ADMIN_PLAN_LABELS[n.plan]}</strong> · {n.patientCount}{' '}
          {n.patientCount === 1 ? 'paciente' : 'pacientes'} · desde {formatAdminDate(n.createdAt)}
        </p>
      </div>
      <AdminPatientsTable patients={patients} />
    </div>
  );
}
