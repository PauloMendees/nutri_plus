import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AnamneseService } from './anamnese.service';
import { AuthContext } from '../../auth/types/auth-context';

const ctx = { user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'n1' } } } as unknown as AuthContext;

describe('AnamneseService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: AnamneseService;
  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new AnamneseService(prisma);
  });

  it('get returns the anamnese for an owned patient', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.patientAnamnese.findUnique.mockResolvedValue({ id: 'a1', patientId: 'p1' } as any);
    expect(await service.get(ctx, 'p1')).toEqual({ id: 'a1', patientId: 'p1' });
  });

  it('get returns null when there is no anamnese yet', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.patientAnamnese.findUnique.mockResolvedValue(null);
    expect(await service.get(ctx, 'p1')).toBeNull();
  });

  it('404s for a non-owned patient (get + upsert)', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);
    await expect(service.get(ctx, 'pX')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.upsert(ctx, 'pX', { mainComplaint: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.patientAnamnese.upsert).not.toHaveBeenCalled();
  });

  it('upsert creates or updates the 1:1 record by patientId', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.patientAnamnese.upsert.mockResolvedValue({ id: 'a1', patientId: 'p1', mealsPerDay: 4 } as any);
    const out = await service.upsert(ctx, 'p1', { mealsPerDay: 4 });
    expect(prisma.patientAnamnese.upsert).toHaveBeenCalledWith({
      where: { patientId: 'p1' },
      create: { patientId: 'p1', mealsPerDay: 4 },
      update: { mealsPerDay: 4 },
    });
    expect(out).toEqual({ id: 'a1', patientId: 'p1', mealsPerDay: 4 });
  });
});
