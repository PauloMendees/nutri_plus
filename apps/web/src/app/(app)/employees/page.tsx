import { EmployeesView } from '@/components/employees/employees-view';
import { Unauthorized } from '@/components/auth/unauthorized';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManageEmployees } from '@/lib/auth/access';

export default async function EmployeesPage() {
  const me = await getCurrentUser();
  if (!me || !canManageEmployees(me.role)) {
    return <Unauthorized />;
  }
  return <EmployeesView />;
}
