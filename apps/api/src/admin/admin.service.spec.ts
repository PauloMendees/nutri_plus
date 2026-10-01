import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AdminService } from './admin.service';

describe('AdminService.listNutritionists', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let supabase: DeepMockProxy<SupabaseAdminService>;
  let service: AdminService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    supabase = mockDeep<SupabaseAdminService>();
    service = new AdminService(prisma, supabase);
    prisma.nutritionistProfile.findMany.mockResolvedValue([
      {
        id: 'n1',
        whatsappNumber: '5511999998888',
        user: { name: 'Ana', email: 'ana@x.com', authProviderId: 'auth-ana', createdAt: new Date('2026-09-10T12:00:00Z') },
        subscription: { isComp: true, status: 'PAST_DUE', plan: 'PRO', currentPeriodEnd: null, trialEndsAt: null },
        _count: { patients: 4 },
      },
    ] as any);
    supabase.listAllUsers.mockResolvedValue([
      { id: 'auth-ana', email: 'ana@x.com', emailConfirmedAt: '2026-09-10T12:00:00Z', invitedAt: null, createdAt: '2026-09-10T12:00:00Z', name: 'Ana', phone: null },
      { id: 'auth-pend', email: 'pend@x.com', emailConfirmedAt: null, invitedAt: null, createdAt: '2026-09-20T12:00:00Z', name: 'Pend', phone: null },
    ]);
  });

  it('merges confirmed nutritionists with pending signups', async () => {
    const res = await service.listNutritionists({}, 1, 20);
    expect(res.total).toBe(2);
    expect(res.items).toEqual([
      expect.objectContaining({ id: null, email: 'pend@x.com', confirmed: false, plan: 'NONE', patientCount: 0 }),
      expect.objectContaining({ id: 'n1', email: 'ana@x.com', confirmed: true, plan: 'COMP', patientCount: 4, phone: '5511999998888' }),
    ]);
  });

  it('counts only real patients', async () => {
    await service.listNutritionists({}, 1, 20);
    expect(prisma.nutritionistProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { patients: { where: { isDemo: false } } } },
        }),
      }),
    );
  });

  it('propagates a 502 when Supabase Auth is unavailable', async () => {
    supabase.listAllUsers.mockRejectedValue(new BadGatewayException('Não foi possível consultar o Supabase Auth.'));
    await expect(service.listNutritionists({}, 1, 20)).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe('AdminService.nutritionistsReport', () => {
  it('uses every filtered row, ignoring pagination, and names the file by date', async () => {
    const prisma = mockDeep<PrismaService>();
    const supabase = mockDeep<SupabaseAdminService>();
    const service = new AdminService(prisma, supabase);
    const rows = Array.from({ length: 45 }, (_, i) => ({
      id: `n${i}`, name: `N${i}`, email: `n${i}@x.com`, phone: null, confirmed: true,
      patientCount: 0, plan: 'NONE' as const, createdAt: '2026-09-10T15:00:00.000Z',
    }));
    const all = jest.spyOn(service, 'allNutritionists').mockResolvedValue(rows);

    const { buffer, fileName } = await service.nutritionistsReport({ confirmed: 'yes' });

    expect(all).toHaveBeenCalledWith({ confirmed: 'yes' });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(fileName).toMatch(/^nutricionistas-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});

describe('AdminService detail and patients', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: AdminService;
  const patientRow = {
    id: 'p1', name: 'Maria', email: 'm@x.com', phone: '5511', userId: 'u9', firstAppLoginAt: null,
    createdAt: new Date('2026-09-15T12:00:00Z'),
    nutritionist: { displayName: 'Dra. Ana', user: { name: 'Ana Souza' } },
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new AdminService(prisma, mockDeep<SupabaseAdminService>());
  });

  it('404 for an unknown nutritionist', async () => {
    prisma.nutritionistProfile.findUnique.mockResolvedValue(null);
    await expect(service.nutritionistDetail('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the nutritionist and her real patients, newest first', async () => {
    prisma.nutritionistProfile.findUnique.mockResolvedValue({
      id: 'n1', whatsappNumber: null,
      user: { name: 'Ana Souza', email: 'ana@x.com', createdAt: new Date('2026-09-01T12:00:00Z') },
      subscription: null, _count: { patients: 1 },
    } as any);
    prisma.patientProfile.findMany.mockResolvedValue([patientRow] as any);

    const res = await service.nutritionistDetail('n1');

    expect(res.nutritionist).toMatchObject({ id: 'n1', confirmed: true, plan: 'NONE', patientCount: 1 });
    expect(res.patients).toEqual([
      { id: 'p1', name: 'Maria', email: 'm@x.com', phone: '5511', nutritionistName: 'Dra. Ana', inviteStatus: 'INVITED', createdAt: '2026-09-15T12:00:00.000Z' },
    ]);
    expect(prisma.patientProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { nutritionistId: 'n1', isDemo: false }, orderBy: { createdAt: 'desc' } }),
    );
  });

  it('lists all real patients with search and pagination', async () => {
    prisma.patientProfile.count.mockResolvedValue(21);
    prisma.patientProfile.findMany.mockResolvedValue([patientRow] as any);

    const res = await service.listPatients('mar', 2, 20);

    expect(res).toMatchObject({ total: 21, page: 2, pageSize: 20, totalPages: 2 });
    const args = prisma.patientProfile.findMany.mock.calls[0][0] as any;
    expect(args.skip).toBe(20);
    expect(args.take).toBe(20);
    expect(args.where.isDemo).toBe(false);
    expect(JSON.stringify(args.where.OR)).toContain('"mode":"insensitive"');
  });
});
