import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { MealPlansService } from './meal-plans.service';
import { MealPlanPdfService } from './meal-plan-pdf.service';
import { AuthContext } from '../auth/types/auth-context';
import * as printer from './pdf/pdf-printer';

jest.mock('./pdf/meal-plan-doc', () => ({ buildMealPlanDocDefinition: jest.fn().mockReturnValue({}) }));

const ctx: AuthContext = {
  authProviderId: 'sub-n',
  email: 'n@x.com',
  name: 'Nut',
  user: { id: 'user-n', role: 'NUTRITIONIST', nutritionistProfile: { id: 'nutri-1' }, patientProfile: null } as any,
};

const plan = {
  id: 'mp1', title: 'Plano A', objective: null, createdAt: new Date('2026-06-27'),
  targetCalories: 1800, targetProtein: 135, targetCarbs: 180, targetFats: 60,
  meals: [{ name: 'Café', timeLabel: '08:00', instructions: null, options: [{ label: 'Opção 1', items: [] }] }],
};

describe('MealPlanPdfService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let mealPlans: DeepMockProxy<MealPlansService>;
  let service: MealPlanPdfService;
  let renderSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    mealPlans = mockDeep<MealPlansService>();
    service = new MealPlanPdfService(prisma, mealPlans);
    renderSpy = jest.spyOn(printer, 'renderPdf').mockResolvedValue(Buffer.from('%PDF-FAKE'));
    // No real network for the logo.
    (global as any).fetch = jest.fn();
  });

  afterEach(() => jest.restoreAllMocks());

  it('builds a PDF buffer from the plan and the nutritionist branding', async () => {
    mealPlans.getPlan.mockResolvedValue(plan as any);
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ displayName: 'Dra. Daniela', logoUrl: null } as any);

    const buf = await service.generate(ctx, 'mp1');

    expect(mealPlans.getPlan).toHaveBeenCalledWith(ctx, 'mp1');
    expect(prisma.nutritionistProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'nutri-1' },
      select: { displayName: true, logoUrl: true },
    });
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer(buf)).toBe(true);
    // No logoUrl -> we never fetch an image.
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('propagates a 404 from getPlan and never renders', async () => {
    mealPlans.getPlan.mockRejectedValue(new NotFoundException('Meal plan not found'));

    await expect(service.generate(ctx, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it('still renders when the logo fetch fails (no logo)', async () => {
    mealPlans.getPlan.mockResolvedValue(plan as any);
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ displayName: null, logoUrl: 'https://x/logo.png' } as any);
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('network'));

    const buf = await service.generate(ctx, 'mp1');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});

const patientCtx = {
  authProviderId: 's',
  email: 'p@x.com',
  name: 'Ana',
  user: { id: 'u', role: 'PATIENT', patientProfile: { id: 'pp-1' } },
} as unknown as AuthContext;

describe('MealPlanPdfService.generateForPatient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads via getMyPlan and resolves branding from the patient nutritionist', async () => {
    jest.spyOn(printer, 'renderPdf').mockResolvedValue(Buffer.from('PDF'));
    const prisma = mockDeep<PrismaService>();
    const mealPlans = mockDeep<MealPlansService>();
    mealPlans.getMyPlan.mockResolvedValue({ id: 'm1', patientId: 'pp-1', meals: [] } as any);
    prisma.patientProfile.findUnique.mockResolvedValue({ nutritionistId: 'nut-1' } as any);
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ displayName: 'Dra X', logoUrl: null } as any);

    const svc = new MealPlanPdfService(prisma, mealPlans);
    const buf = await svc.generateForPatient(patientCtx, 'm1');

    expect(mealPlans.getMyPlan).toHaveBeenCalledWith(patientCtx, 'm1');
    expect(prisma.patientProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'pp-1' },
      select: { nutritionistId: true },
    });
    expect(prisma.nutritionistProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'nut-1' },
      select: { displayName: true, logoUrl: true },
    });
    expect(buf).toEqual(Buffer.from('PDF'));
  });
});
