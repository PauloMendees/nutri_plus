import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@nutri-plus/shared-types';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/components/patients/patient-import-wizard', () => ({
  PatientImportWizard: () => <div>patient-import-wizard</div>,
}));

import ImportPatientsPage from './page';

function me(role: UserRole) {
  return { id: 'u1', email: 'x@y.com', name: 'X', role };
}

beforeEach(() => getCurrentUser.mockReset());

describe('ImportPatientsPage guard', () => {
  it('shows the import wizard for a nutritionist', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.NUTRITIONIST));
    render(await ImportPatientsPage());
    expect(screen.getByText('patient-import-wizard')).toBeInTheDocument();
  });

  it('shows Não autorizado for an employee', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.EMPLOYEE));
    render(await ImportPatientsPage());
    expect(screen.getByText(/não autorizado/i)).toBeInTheDocument();
    expect(screen.queryByText('patient-import-wizard')).not.toBeInTheDocument();
  });
});
