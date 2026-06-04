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

  it('lists only patients linked to the nutritionist', async () => {
    prisma.patientProfile.findMany.mockResolvedValue([{ id: 'p1' }] as any);

    const result = await service.listPatients(ctx);

    expect(prisma.patientProfile.findMany).toHaveBeenCalledWith({
      where: { nutritionistId: 'nutri-1' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    expect(result).toEqual([{ id: 'p1' }]);
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

  it('updates an owned patient with only the provided fields', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.patientProfile.update.mockResolvedValue({ id: 'p1' } as any);

    const dto = { height: 180 } as any;
    const result = await service.updatePatient(ctx, 'p1', dto);

    expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', nutritionistId: 'nutri-1' },
      select: { id: true },
    });
    expect(prisma.patientProfile.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: dto,
    });
    expect(result).toEqual({ id: 'p1' });
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

  describe('createPatient', () => {
    const dto = { name: 'Ann', email: 'a@x.com', height: 160 } as any;

    it('invites the patient then creates the linked local record', async () => {
      supabaseAdmin.invitePatient.mockResolvedValue({ id: 'sub-new' });
      users.createInvitedPatient.mockResolvedValue({
        patientProfile: { id: 'pp1' },
      } as any);
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'pp1' } as any);

      const result = await service.createPatient(ctx, dto);

      expect(supabaseAdmin.invitePatient).toHaveBeenCalledWith('a@x.com', {
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
      supabaseAdmin.invitePatient.mockResolvedValue({ id: 'sub-new' });
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
      expect(supabaseAdmin.invitePatient).not.toHaveBeenCalled();
    });
  });
});
