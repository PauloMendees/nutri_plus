import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from './patients.service';
import { UsersService } from '../users/users.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AuthContext } from '../auth/types/auth-context';

function ctxWithNutritionist(nutritionistId: string | null): AuthContext {
  return {
    authProviderId: 'sub-1',
    email: 'n@x.com',
    name: 'Nut',
    user: {
      id: 'user-1',
      role: 'NUTRITIONIST',
      nutritionistProfile: nutritionistId ? { id: nutritionistId } : null,
      patientProfile: null,
    } as any,
  };
}

function ctxWithEmployee(nutritionistId: string): AuthContext {
  return {
    authProviderId: 'sub-e',
    email: 'e@x.com',
    name: 'Emp',
    user: {
      id: 'user-e',
      role: 'EMPLOYEE',
      nutritionistProfile: null,
      patientProfile: null,
      employeeProfile: { nutritionistId },
    } as any,
  };
}

function ctxWithPatient(patientProfileId: string | null, height: number | null): AuthContext {
  return {
    authProviderId: 'sub-p',
    email: 'p@x.com',
    name: 'Ana',
    user: {
      id: 'user-p',
      role: 'PATIENT',
      nutritionistProfile: null,
      employeeProfile: null,
      patientProfile: patientProfileId ? { id: patientProfileId, height } : null,
    } as any,
  };
}

describe('PatientsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let users: DeepMockProxy<UsersService>;
  let supabaseAdmin: DeepMockProxy<SupabaseAdminService>;
  let service: PatientsService;
  const ctx = ctxWithNutritionist('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    users = mockDeep<UsersService>();
    supabaseAdmin = mockDeep<SupabaseAdminService>();
    service = new PatientsService(prisma, users, supabaseAdmin);
  });

  it('scopes an employee to the owning nutritionist and paginates', async () => {
    prisma.$transaction.mockResolvedValue([[{ id: 'p1' }], 1] as any);

    const result = await service.listPatients(ctxWithEmployee('nutri-9'));

    expect(prisma.patientProfile.findMany).toHaveBeenCalledWith({
      where: { nutritionistId: 'nutri-9' },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
      skip: 0,
      take: 20,
    });
    expect(prisma.patientProfile.count).toHaveBeenCalledWith({
      where: { nutritionistId: 'nutri-9' },
    });
    expect(result).toEqual({ items: [{ id: 'p1' }], total: 1, page: 1, pageSize: 20, totalPages: 1 });
  });

  it('lists only patients linked to the nutritionist (default page 1, size 20)', async () => {
    prisma.$transaction.mockResolvedValue([[{ id: 'p1' }], 1] as any);

    const result = await service.listPatients(ctx);

    expect(prisma.patientProfile.findMany).toHaveBeenCalledWith({
      where: { nutritionistId: 'nutri-1' },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
      skip: 0,
      take: 20,
    });
    expect(prisma.patientProfile.count).toHaveBeenCalledWith({
      where: { nutritionistId: 'nutri-1' },
    });
    expect(result).toEqual({ items: [{ id: 'p1' }], total: 1, page: 1, pageSize: 20, totalPages: 1 });
  });

  it('filters by name/email (case-insensitive) and applies skip/take per page', async () => {
    prisma.$transaction.mockResolvedValue([[{ id: 'p1' }], 35] as any);

    const result = await service.listPatients(ctx, { search: 'ana', page: 2, pageSize: 10 });

    const where = {
      nutritionistId: 'nutri-1',
      user: {
        OR: [
          { name: { contains: 'ana', mode: 'insensitive' } },
          { email: { contains: 'ana', mode: 'insensitive' } },
        ],
      },
    };
    expect(prisma.patientProfile.findMany).toHaveBeenCalledWith({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
      skip: 10,
      take: 10,
    });
    expect(prisma.patientProfile.count).toHaveBeenCalledWith({ where });
    expect(result).toEqual({ items: [{ id: 'p1' }], total: 35, page: 2, pageSize: 10, totalPages: 4 });
  });

  it('throws ForbiddenException when the context has no nutritionist profile', async () => {
    await expect(
      service.listPatients(ctxWithNutritionist(null)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns patient detail with the latest assessment, scoped by ownership', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);

    const result = await service.getPatient(ctx, 'p1');

    expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', nutritionistId: 'nutri-1' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 },
      },
    });
    expect(result).toEqual({ id: 'p1' });
  });

  it('throws NotFoundException when the patient is not owned (detail)', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);

    await expect(service.getPatient(ctx, 'other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates an owned patient and returns the full detail (user + latest assessment)', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    const full = { id: 'p1', user: { id: 'u1', name: 'Ann', email: 'a@x.com' }, assessments: [] };
    prisma.patientProfile.update.mockResolvedValue(full as any);

    const dto = { height: 180 } as any;
    const result = await service.updatePatient(ctx, 'p1', dto);

    expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', nutritionistId: 'nutri-1' },
      select: { id: true },
    });
    // The PATCH response must carry the same shape as GET (user + latest
    // assessment) so the cached detail stays complete — otherwise the patient
    // page crashes on patient.user after save.
    expect(prisma.patientProfile.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: dto,
      include: {
        user: { select: { id: true, name: true, email: true } },
        assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 },
      },
    });
    expect(result).toEqual(full);
  });

  it('does not update when the patient is not owned', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.updatePatient(ctx, 'other', { height: 180 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.patientProfile.update).not.toHaveBeenCalled();
  });

  it('creates an assessment for an owned patient', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.bodyAssessment.create.mockResolvedValue({ id: 'a1' } as any);

    const dto = { weight: 80 } as any;
    const result = await service.createAssessment(ctx, 'p1', dto);

    expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', nutritionistId: 'nutri-1' },
      select: { id: true },
    });
    expect(prisma.bodyAssessment.create).toHaveBeenCalledWith({
      data: { weight: 80, patientId: 'p1' },
    });
    expect(result).toEqual({ id: 'a1' });
  });

  it('does not create an assessment for a non-owned patient', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.createAssessment(ctx, 'other', { weight: 80 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.bodyAssessment.create).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException on update when the context has no nutritionist profile', async () => {
    await expect(
      service.updatePatient(ctxWithNutritionist(null), 'p1', { height: 180 } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.patientProfile.update).not.toHaveBeenCalled();
  });

  it('lists assessments newest-first for an owned patient', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.bodyAssessment.findMany.mockResolvedValue([{ id: 'a1' }] as any);

    const result = await service.listAssessments(ctx, 'p1');

    expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', nutritionistId: 'nutri-1' },
      select: { id: true },
    });
    expect(prisma.bodyAssessment.findMany).toHaveBeenCalledWith({
      where: {
        patientId: 'p1',
        patient: { nutritionistId: 'nutri-1' },
      },
      orderBy: { assessmentDate: 'desc' },
    });
    expect(result).toEqual([{ id: 'a1' }]);
  });

  it('updates an owned assessment', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.bodyAssessment.findFirst.mockResolvedValue({ id: 'a1' } as any);
    prisma.bodyAssessment.update.mockResolvedValue({ id: 'a1', weight: 80 } as any);

    const result = await service.updateAssessment(ctx, 'p1', 'a1', { weight: 80 } as any);

    expect(prisma.bodyAssessment.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', patientId: 'p1' },
      select: { id: true },
    });
    expect(prisma.bodyAssessment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { weight: 80 },
    });
    expect(result).toEqual({ id: 'a1', weight: 80 });
  });

  it('does not update an assessment for a non-owned patient', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);
    await expect(
      service.updateAssessment(ctx, 'other', 'a1', { weight: 80 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.bodyAssessment.update).not.toHaveBeenCalled();
  });

  it('throws when the assessment does not belong to the patient', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.bodyAssessment.findFirst.mockResolvedValue(null);
    await expect(
      service.updateAssessment(ctx, 'p1', 'a1', { weight: 80 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.bodyAssessment.update).not.toHaveBeenCalled();
  });

  it('removes an owned assessment', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.bodyAssessment.findFirst.mockResolvedValue({ id: 'a1' } as any);
    prisma.bodyAssessment.delete.mockResolvedValue({ id: 'a1' } as any);

    await service.removeAssessment(ctx, 'p1', 'a1');

    expect(prisma.bodyAssessment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('does not remove an assessment that does not belong to the patient', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.bodyAssessment.findFirst.mockResolvedValue(null);
    await expect(service.removeAssessment(ctx, 'p1', 'a1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.bodyAssessment.delete).not.toHaveBeenCalled();
  });

  describe('listMyAssessments', () => {
    it("returns the caller's assessments ordered by date, with name and height", async () => {
      const rows = [
        { id: 'a1', patientId: 'pp-1', assessmentDate: new Date('2026-01-01'), weight: 80 },
        { id: 'a2', patientId: 'pp-1', assessmentDate: new Date('2026-02-01'), weight: 79 },
      ];
      prisma.bodyAssessment.findMany.mockResolvedValue(rows as any);

      const result = await service.listMyAssessments(ctxWithPatient('pp-1', 170));

      expect(prisma.bodyAssessment.findMany).toHaveBeenCalledWith({
        where: { patientId: 'pp-1' },
        orderBy: { assessmentDate: 'asc' },
      });
      expect(result).toEqual({ name: 'Ana', height: 170, assessments: rows });
    });

    it('returns an empty list when the patient has no assessments', async () => {
      prisma.bodyAssessment.findMany.mockResolvedValue([] as any);
      const result = await service.listMyAssessments(ctxWithPatient('pp-2', null));
      expect(result).toEqual({ name: 'Ana', height: null, assessments: [] });
    });

    it('rejects a caller without a patient profile', async () => {
      await expect(service.listMyAssessments(ctxWithPatient(null, null))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('createPatient', () => {
    const dto = { name: 'Ann', email: 'a@x.com', height: 160 } as any;

    it('invites the patient then creates the linked local record', async () => {
      supabaseAdmin.inviteUser.mockResolvedValue({ id: 'sub-new' });
      users.createInvitedPatient.mockResolvedValue({
        patientProfile: { id: 'pp1' },
      } as any);
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'pp1' } as any);

      const result = await service.createPatient(ctx, dto);

      expect(supabaseAdmin.inviteUser).toHaveBeenCalledWith('a@x.com', {
        name: 'Ann',
      });
      expect(users.createInvitedPatient).toHaveBeenCalledWith({
        authProviderId: 'sub-new',
        email: 'a@x.com',
        name: 'Ann',
        nutritionistId: 'nutri-1',
        clinical: { height: 160 },
      });
      expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
        where: { id: 'pp1', nutritionistId: 'nutri-1' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 },
        },
      });
      expect(result).toEqual({ id: 'pp1' });
    });

    it('rolls back the invited user when the local write fails', async () => {
      supabaseAdmin.inviteUser.mockResolvedValue({ id: 'sub-new' });
      users.createInvitedPatient.mockRejectedValue(new ConflictException('dup'));

      await expect(service.createPatient(ctx, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(supabaseAdmin.deleteUser).toHaveBeenCalledWith('sub-new');
    });

    it('does not invite when the caller has no nutritionist profile', async () => {
      await expect(
        service.createPatient(ctxWithNutritionist(null), dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(supabaseAdmin.inviteUser).not.toHaveBeenCalled();
    });
  });
});
