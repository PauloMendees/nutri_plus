import { PatientImportWizard } from '@/components/patients/patient-import-wizard';
import { Unauthorized } from '@/components/auth/unauthorized';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function ImportPatientsPage() {
  const me = await getCurrentUser();
  if (!me || !canManagePatients(me.role)) {
    return <Unauthorized />;
  }
  return <PatientImportWizard />;
}
