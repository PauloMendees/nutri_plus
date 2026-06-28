import { MealPlanEditor } from '@/components/patients/meal-plan-editor';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function MealPlanPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id, planId } = await params;
  const me = await getCurrentUser();
  const canEdit = !!me && canManagePatients(me.role);
  return <MealPlanEditor patientId={id} planId={planId} canEdit={canEdit} />;
}
