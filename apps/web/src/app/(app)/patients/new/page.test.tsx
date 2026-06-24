import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@nutri-plus/shared-types';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/components/patients/create-patient-form', () => ({
  CreatePatientForm: () => <div>create-patient-form</div>,
}));

import NewPatientPage from './page';

function me(role: UserRole) {
  return { id: 'u1', email: 'x@y.com', name: 'X', role };
}

beforeEach(() => getCurrentUser.mockReset());

describe('NewPatientPage guard', () => {
  it('shows the create form for a nutritionist', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.NUTRITIONIST));
    render(await NewPatientPage());
    expect(screen.getByText('create-patient-form')).toBeInTheDocument();
  });

  it('shows Não autorizado for an employee', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.EMPLOYEE));
    render(await NewPatientPage());
    expect(screen.getByText(/não autorizado/i)).toBeInTheDocument();
    expect(screen.queryByText('create-patient-form')).not.toBeInTheDocument();
  });
});
