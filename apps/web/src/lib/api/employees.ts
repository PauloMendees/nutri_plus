import type {
  Employee,
  InviteEmployeeRequest,
  UpdateEmployeeRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listEmployees(): Promise<Employee[]> {
  return browserApiFetch<Employee[]>('/employees');
}

export function inviteEmployee(body: InviteEmployeeRequest): Promise<Employee> {
  return browserApiFetch<Employee>('/employees', { method: 'POST', body });
}

export function updateEmployee(id: string, body: UpdateEmployeeRequest): Promise<Employee> {
  return browserApiFetch<Employee>(`/employees/${id}`, { method: 'PATCH', body });
}

export function deleteEmployee(id: string): Promise<void> {
  return browserApiFetch<void>(`/employees/${id}`, { method: 'DELETE' });
}
