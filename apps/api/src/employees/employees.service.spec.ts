import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { EmployeesService } from './employees.service';
import { AuthContext } from '../auth/types/auth-context';

function nutCtx(nutritionistId: string): AuthContext {
  return {
    authProviderId: 'sub-n',
    email: 'n@x.com',
    name: 'Nut',
    user: {
      id: 'user-n',
      role: 'NUTRITIONIST',
      nutritionistProfile: { id: nutritionistId },
      patientProfile: null,
      employeeProfile: null,
    } as any,
  };
}

describe('EmployeesService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let users: DeepMockProxy<UsersService>;
  let supabaseAdmin: DeepMockProxy<SupabaseAdminService>;
  let service: EmployeesService;
  const ctx = nutCtx('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    users = mockDeep<UsersService>();
    supabaseAdmin = mockDeep<SupabaseAdminService>();
    service = new EmployeesService(prisma, users, supabaseAdmin);
  });

  it('lists only employees linked to the nutritionist', async () => {
    prisma.employeeProfile.findMany.mockResolvedValue([{ id: 'e1' }] as any);

    const result = await service.listEmployees(ctx);

    expect(prisma.employeeProfile.findMany).toHaveBeenCalledWith({
      where: { nutritionistId: 'nutri-1' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    expect(result).toEqual([{ id: 'e1' }]);
  });

  it('invites an employee: Supabase invite then linked local create', async () => {
    supabaseAdmin.inviteUser.mockResolvedValue({ id: 'sub-e' });
    users.createInvitedEmployee.mockResolvedValue({
      employeeProfile: { id: 'e1' },
    } as any);
    prisma.employeeProfile.findFirst.mockResolvedValue({ id: 'e1' } as any);

    const result = await service.inviteEmployee(ctx, { name: 'Emp', email: 'e@x.com' });

    expect(supabaseAdmin.inviteUser).toHaveBeenCalledWith('e@x.com', { name: 'Emp' });
    expect(users.createInvitedEmployee).toHaveBeenCalledWith({
      authProviderId: 'sub-e',
      email: 'e@x.com',
      name: 'Emp',
      nutritionistId: 'nutri-1',
    });
    expect(result).toEqual({ id: 'e1' });
  });

  it('rolls back the Supabase user when the local create fails', async () => {
    supabaseAdmin.inviteUser.mockResolvedValue({ id: 'sub-e' });
    users.createInvitedEmployee.mockRejectedValue(new Error('db down'));

    await expect(
      service.inviteEmployee(ctx, { name: 'Emp', email: 'e@x.com' }),
    ).rejects.toThrow('db down');
    expect(supabaseAdmin.deleteUser).toHaveBeenCalledWith('sub-e');
  });

  it('removes an owned employee: local txn then Supabase delete', async () => {
    prisma.employeeProfile.findFirst.mockResolvedValue({
      id: 'e1',
      userId: 'user-e',
      user: { authProviderId: 'sub-e' },
    } as any);
    prisma.$transaction.mockResolvedValue([] as any);

    await service.removeEmployee(ctx, 'e1');

    expect(prisma.employeeProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'e1', nutritionistId: 'nutri-1' },
      select: { id: true, userId: true, user: { select: { authProviderId: true } } },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(supabaseAdmin.deleteUser).toHaveBeenCalledWith('sub-e');
  });

  it('throws NotFoundException removing a non-owned employee', async () => {
    prisma.employeeProfile.findFirst.mockResolvedValue(null);

    await expect(service.removeEmployee(ctx, 'e1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates an owned employee name and returns the refreshed employee', async () => {
    prisma.employeeProfile.findFirst
      .mockResolvedValueOnce({ id: 'e1', userId: 'user-e' } as any) // scoped ownership lookup
      .mockResolvedValueOnce({
        id: 'e1',
        user: { id: 'user-e', name: 'New Name', email: 'e@x.com' },
      } as any); // getEmployee include
    prisma.user.update.mockResolvedValue({} as any);

    const result = await service.updateEmployee(ctx, 'e1', { name: 'New Name' });

    expect(prisma.employeeProfile.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'e1', nutritionistId: 'nutri-1' },
      select: { id: true, userId: true },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-e' },
      data: { name: 'New Name' },
    });
    expect(result).toEqual({
      id: 'e1',
      user: { id: 'user-e', name: 'New Name', email: 'e@x.com' },
    });
  });

  it('throws NotFoundException updating a non-owned employee', async () => {
    prisma.employeeProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.updateEmployee(ctx, 'e1', { name: 'New Name' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
