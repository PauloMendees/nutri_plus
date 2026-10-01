import { BadGatewayException } from '@nestjs/common';
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
