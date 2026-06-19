import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, UserRole } from '../generated/prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: UsersService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new UsersService(prisma);
  });

  it('creates a patient with a referral-linked nutritionist', async () => {
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ id: 'nutri-1' } as any);
    prisma.user.create.mockResolvedValue({ id: 'user-1' } as any);

    await service.createWithProfile({
      authProviderId: 'sub-1',
      email: 'p@x.com',
      name: 'Pat',
      role: UserRole.PATIENT,
      referralCode: 'NUTRI-ABCDE',
    });

    expect(prisma.nutritionistProfile.findUnique).toHaveBeenCalledWith({
      where: { referralCode: 'NUTRI-ABCDE' },
    });
    const createArg = prisma.user.create.mock.calls[0][0] as any;
    expect(createArg.data.role).toBe(UserRole.PATIENT);
    expect(createArg.data.patientProfile.create.nutritionistId).toBe('nutri-1');
  });

  it('rejects an unknown referral code', async () => {
    prisma.nutritionistProfile.findUnique.mockResolvedValue(null);

    await expect(
      service.createWithProfile({
        authProviderId: 'sub-2',
        email: 'p2@x.com',
        name: 'Pat2',
        role: UserRole.PATIENT,
        referralCode: 'NUTRI-ZZZZZ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates a nutritionist with a generated referral code', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-3' } as any);

    await service.createWithProfile({
      authProviderId: 'sub-3',
      email: 'n@x.com',
      name: 'Nut',
      role: UserRole.NUTRITIONIST,
    });

    const createArg = prisma.user.create.mock.calls[0][0] as any;
    expect(createArg.data.role).toBe(UserRole.NUTRITIONIST);
    expect(createArg.data.nutritionistProfile.create.referralCode).toMatch(
      /^NUTRI-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/,
    );
  });

  it('retries referral code generation on a unique collision', async () => {
    const collision = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test', meta: { target: ['referralCode'] } },
    );
    prisma.user.create
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({ id: 'user-5' } as any);

    const result = await service.createWithProfile({
      authProviderId: 'sub-5',
      email: 'n5@x.com',
      name: 'Nut5',
      role: UserRole.NUTRITIONIST,
    });

    expect(prisma.user.create).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ id: 'user-5' });
  });

  it('does not retry on a non-referralCode unique collision (e.g. email)', async () => {
    const emailCollision = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test', meta: { target: ['email'] } },
    );
    prisma.user.create.mockRejectedValue(emailCollision);

    await expect(
      service.createWithProfile({
        authProviderId: 'sub-6',
        email: 'dup@x.com',
        name: 'Dup',
        role: UserRole.NUTRITIONIST,
      }),
    ).rejects.toBe(emailCollision);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it('rethrows after exhausting referral code retry attempts', async () => {
    const collision = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test', meta: { target: ['referralCode'] } },
    );
    prisma.user.create.mockRejectedValue(collision);

    await expect(
      service.createWithProfile({
        authProviderId: 'sub-7',
        email: 'n7@x.com',
        name: 'Nut7',
        role: UserRole.NUTRITIONIST,
      }),
    ).rejects.toBe(collision);
    expect(prisma.user.create).toHaveBeenCalledTimes(5);
  });

  it('updates email and name for an existing user', async () => {
    prisma.user.update.mockResolvedValue({ id: 'user-4' } as any);

    await service.updateBasics('user-4', { email: 'new@x.com', name: 'New' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-4' },
      data: { email: 'new@x.com', name: 'New' },
      include: { nutritionistProfile: true, patientProfile: true, employeeProfile: true },
    });
  });

  it('finds a user by auth provider id', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-8' } as any);

    const result = await service.findByAuthProviderId('sub-8');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        authProvider_authProviderId: {
          authProvider: 'SUPABASE',
          authProviderId: 'sub-8',
        },
      },
      include: { nutritionistProfile: true, patientProfile: true, employeeProfile: true },
    });
    expect(result).toEqual({ id: 'user-8' });
  });

  it('creates an invited patient linked to the nutritionist with clinical fields', async () => {
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      patientProfile: { id: 'pp1' },
    } as any);

    await service.createInvitedPatient({
      authProviderId: 'sub-1',
      email: 'p@x.com',
      name: 'Pat',
      nutritionistId: 'nutri-1',
      clinical: { height: 165 } as any,
    });

    const arg = prisma.user.create.mock.calls[0][0] as any;
    expect(arg.data.role).toBe(UserRole.PATIENT);
    expect(arg.data.authProvider).toBe('SUPABASE');
    expect(arg.data.authProviderId).toBe('sub-1');
    expect(arg.data.email).toBe('p@x.com');
    expect(arg.data.patientProfile.create).toEqual({
      nutritionistId: 'nutri-1',
      height: 165,
    });
  });

  it('maps a duplicate email to ConflictException', async () => {
    const dup = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });
    prisma.user.create.mockRejectedValue(dup);

    await expect(
      service.createInvitedPatient({
        authProviderId: 'sub-2',
        email: 'dup@x.com',
        name: 'Dup',
        nutritionistId: 'nutri-1',
        clinical: {} as any,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
