import { notFound } from 'next/navigation';
import { AdminNutritionistDetail } from '@/components/admin/nutritionist-detail';
import { getCurrentUser } from '@/lib/auth/current-user';

export default async function AdminNutritionistPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) notFound();
  const { id } = await params;
  return <AdminNutritionistDetail id={id} />;
}
