import { MealPlanEditor } from '@/components/patients/meal-plan-editor';
import { Unauthorized } from '@/components/auth/unauthorized';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function NewMealPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me || !canManagePatients(me.role)) {
    return <Unauthorized />;
  }
  return <MealPlanEditor patientId={id} canEdit />;
}
