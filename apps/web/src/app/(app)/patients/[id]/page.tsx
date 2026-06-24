import { PatientDetail } from '@/components/patients/patient-detail';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const me = await getCurrentUser();
  const canEdit = !!me && canManagePatients(me.role);
  return <PatientDetail id={id} created={created === '1'} canEdit={canEdit} />;
}
