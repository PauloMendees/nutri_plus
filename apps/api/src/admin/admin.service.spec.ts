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
