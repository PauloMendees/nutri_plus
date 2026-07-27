import { FoodRecallEditor } from '@/components/patients/food-recall-editor';
import { Unauthorized } from '@/components/auth/unauthorized';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function NewFoodRecallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me || !canManagePatients(me.role)) {
    return <Unauthorized />;
  }
  return <FoodRecallEditor patientId={id} canEdit />;
}
