import { FoodRecallEditor } from '@/components/patients/food-recall-editor';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function FoodRecallPage({
  params,
}: {
  params: Promise<{ id: string; recallId: string }>;
}) {
  const { id, recallId } = await params;
  const me = await getCurrentUser();
  const canEdit = !!me && canManagePatients(me.role);
  return <FoodRecallEditor patientId={id} recallId={recallId} canEdit={canEdit} />;
}
