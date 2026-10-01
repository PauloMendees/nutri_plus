import { notFound } from 'next/navigation';
import { AdminNutritionistDetail } from '@/components/admin/nutritionist-detail';
import { adminPanelHref } from '@/lib/admin/panel-url';
import { getCurrentUser } from '@/lib/auth/current-user';

export default async function AdminNutritionistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ voltar?: string | string[] }>;
}) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) notFound();
  const { id } = await params;
  const { voltar } = await searchParams;
  return <AdminNutritionistDetail id={id} backHref={adminPanelHref(voltar)} />;
}
