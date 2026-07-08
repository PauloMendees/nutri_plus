import { PatientsList } from '@/components/patients/patients-list';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function PatientsPage() {
  const me = await getCurrentUser();
  const canCreate = !!me && canManagePatients(me.role);
  return <PatientsList canCreate={canCreate} />;
}
