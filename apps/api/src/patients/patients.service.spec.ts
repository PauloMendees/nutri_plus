import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from './patients.service';
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
  let service: PatientsService;
  const ctx = ctxWithNutritionist('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new PatientsService(prisma);
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

  it('lists assessments newest-first for an owned patient', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.bodyAssessment.findMany.mockResolvedValue([{ id: 'a1' }] as any);

    const result = await service.listAssessments(ctx, 'p1');

    expect(prisma.bodyAssessment.findMany).toHaveBeenCalledWith({
      where: { patientId: 'p1' },
      orderBy: { assessmentDate: 'desc' },
    });
    expect(result).toEqual([{ id: 'a1' }]);
  });
});
