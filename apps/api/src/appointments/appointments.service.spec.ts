import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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

  it('rejects a categoryId the nutritionist does not own', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    (prisma.appointmentCategory as any).findFirst.mockResolvedValue(null);

    await expect(
      service.create(ctx, {
        title: 'Consult',
        categoryId: 'cat-x',
        startsAt: T('2026-07-01T13:00:00.000Z'),
        endsAt: T('2026-07-01T14:00:00.000Z'),
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((prisma.appointmentCategory as any).findFirst).toHaveBeenCalledWith({
      where: { id: 'cat-x', nutritionistId: 'nutri-1' },
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

describe('AppointmentsService reads/mutations', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: AppointmentsService;
  const ctx = nutCtx('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new AppointmentsService(prisma);
  });

  it('lists appointments overlapping [from, to) ordered by startsAt', async () => {
    prisma.appointment.findMany.mockResolvedValue([] as any);

    await service.list(ctx, {
      from: T('2026-07-01T00:00:00.000Z'),
      to: T('2026-07-02T00:00:00.000Z'),
    });

    expect(prisma.appointment.findMany).toHaveBeenCalledWith({
      where: {
        nutritionistId: 'nutri-1',
        startsAt: { lt: T('2026-07-02T00:00:00.000Z') },
        endsAt: { gt: T('2026-07-01T00:00:00.000Z') },
      },
      orderBy: { startsAt: 'asc' },
      include: {
        patient: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
        category: { select: { id: true, name: true, color: true } },
      },
    });
  });

  it('lists all of the nutritionist appointments when no window is given', async () => {
    prisma.appointment.findMany.mockResolvedValue([] as any);

    await service.list(ctx, {});

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { nutritionistId: 'nutri-1' },
        orderBy: { startsAt: 'asc' },
      }),
    );
  });

  it('getOne throws NotFoundException when not owned/missing', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    await expect(service.getOne(ctx, 'a1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', nutritionistId: 'nutri-1' },
      include: {
        patient: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
        category: { select: { id: true, name: true, color: true } },
      },
    });
  });

  it('update re-runs the overlap check excluding itself', async () => {
    prisma.appointment.findFirst
      .mockResolvedValueOnce({
        id: 'a1',
        nutritionistId: 'nutri-1',
        startsAt: T('2026-07-01T13:00:00.000Z'),
        endsAt: T('2026-07-01T14:00:00.000Z'),
      } as any) // requireOwned lookup
      .mockResolvedValueOnce(null); // conflict lookup
    prisma.appointment.update.mockResolvedValue({ id: 'a1' } as any);

    await service.update(ctx, 'a1', { endsAt: T('2026-07-01T15:00:00.000Z') });

    // The conflict lookup (2nd findFirst) excludes the appointment itself.
    expect(prisma.appointment.findFirst).toHaveBeenLastCalledWith({
      where: {
        nutritionistId: 'nutri-1',
        startsAt: { lt: T('2026-07-01T15:00:00.000Z') },
        endsAt: { gt: T('2026-07-01T13:00:00.000Z') },
        id: { not: 'a1' },
      },
      select: { id: true },
    });
    expect(prisma.appointment.update).toHaveBeenCalled();
  });

  it('update throws NotFoundException when the appointment is not owned', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    await expect(
      service.update(ctx, 'a1', { title: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('update rejects a categoryId the nutritionist does not own (400)', async () => {
    prisma.appointment.findFirst
      .mockResolvedValueOnce({
        id: 'a1',
        nutritionistId: 'nutri-1',
        startsAt: T('2026-07-01T13:00:00.000Z'),
        endsAt: T('2026-07-01T14:00:00.000Z'),
      } as any) // requireOwned lookup
      .mockResolvedValueOnce(null); // conflict lookup
    (prisma.appointmentCategory as any).findFirst.mockResolvedValue(null);

    await expect(
      service.update(ctx, 'a1', { categoryId: 'cat-x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((prisma.appointmentCategory as any).findFirst).toHaveBeenCalledWith({
      where: { id: 'cat-x', nutritionistId: 'nutri-1' },
      select: { id: true },
    });
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('remove deletes an owned appointment', async () => {
    prisma.appointment.findFirst.mockResolvedValue({ id: 'a1' } as any);
    prisma.appointment.delete.mockResolvedValue({ id: 'a1' } as any);

    await service.remove(ctx, 'a1');

    expect(prisma.appointment.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', nutritionistId: 'nutri-1' },
      select: { id: true },
    });
    expect(prisma.appointment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('remove throws NotFoundException when not owned', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    await expect(service.remove(ctx, 'a1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.delete).not.toHaveBeenCalled();
  });
});
