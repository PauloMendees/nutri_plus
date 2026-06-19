import { BadRequestException, ConflictException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';
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

function empCtx(nutritionistId: string): AuthContext {
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

const T = (iso: string) => new Date(iso);

describe('AppointmentsService.create', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: AppointmentsService;
  const ctx = nutCtx('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new AppointmentsService(prisma);
  });

  it('rejects endsAt equal to or before startsAt (400)', async () => {
    await expect(
      service.create(ctx, {
        title: 'X',
        startsAt: T('2026-07-01T14:00:00.000Z'),
        endsAt: T('2026-07-01T14:00:00.000Z'),
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('queries overlap with half-open bounds scoped to the nutritionist, then creates', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.create.mockResolvedValue({ id: 'a1' } as any);

    await service.create(ctx, {
      title: 'Consult',
      startsAt: T('2026-07-01T13:00:00.000Z'),
      endsAt: T('2026-07-01T14:00:00.000Z'),
    } as any);

    expect(prisma.appointment.findFirst).toHaveBeenCalledWith({
      where: {
        nutritionistId: 'nutri-1',
        startsAt: { lt: T('2026-07-01T14:00:00.000Z') },
        endsAt: { gt: T('2026-07-01T13:00:00.000Z') },
      },
      select: { id: true },
    });
    expect(prisma.appointment.create).toHaveBeenCalled();
  });

  it('throws ConflictException when an overlapping appointment exists (409)', async () => {
    prisma.appointment.findFirst.mockResolvedValue({ id: 'other' } as any);

    await expect(
      service.create(ctx, {
        title: 'Consult',
        startsAt: T('2026-07-01T13:30:00.000Z'),
        endsAt: T('2026-07-01T14:30:00.000Z'),
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('validates an explicit patientId belongs to the nutritionist (400 when not)', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.create(ctx, {
        title: 'Consult',
        patientId: '11111111-1111-1111-1111-111111111111',
        startsAt: T('2026-07-01T13:00:00.000Z'),
        endsAt: T('2026-07-01T14:00:00.000Z'),
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
      where: { id: '11111111-1111-1111-1111-111111111111', nutritionistId: 'nutri-1' },
      select: { id: true },
    });
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('scopes an EMPLOYEE to the owning nutritionist when creating', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.create.mockResolvedValue({ id: 'a1' } as any);

    await service.create(empCtx('nutri-9'), {
      title: 'Consult',
      startsAt: T('2026-07-01T13:00:00.000Z'),
      endsAt: T('2026-07-01T14:00:00.000Z'),
    } as any);

    expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ nutritionistId: 'nutri-9' }) }),
    );
    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nutritionistId: 'nutri-9' }) }),
    );
  });
});
