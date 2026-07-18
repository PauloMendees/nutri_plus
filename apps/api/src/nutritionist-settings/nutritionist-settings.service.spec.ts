import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { NutritionistSettingsService } from './nutritionist-settings.service';
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

const SELECT = {
  displayName: true,
  logoUrl: true,
  mealPlanAiInstructions: true,
  defaultCanLogAssessments: true,
  defaultShowMealTargetToPatient: true,
};

describe('NutritionistSettingsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let supabaseAdmin: DeepMockProxy<SupabaseAdminService>;
  let service: NutritionistSettingsService;
  const ctx = nutCtx('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    supabaseAdmin = mockDeep<SupabaseAdminService>();
    service = new NutritionistSettingsService(prisma, supabaseAdmin);
  });

  it('returns the caller settings scoped to their own profile', async () => {
    prisma.nutritionistProfile.findUniqueOrThrow.mockResolvedValue({
      displayName: 'Dra. Ana', logoUrl: null, mealPlanAiInstructions: null,
      defaultCanLogAssessments: false, defaultShowMealTargetToPatient: false,
    } as any);
    const result = await service.getSettings(ctx);
    expect(prisma.nutritionistProfile.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'nutri-1' },
      select: SELECT,
    });
    expect(result).toEqual({
      displayName: 'Dra. Ana', logoUrl: null, mealPlanAiInstructions: null,
      defaultCanLogAssessments: false, defaultShowMealTargetToPatient: false,
    });
  });

  it('returns the 2 patient-app defaults alongside the existing settings', async () => {
    prisma.nutritionistProfile.findUniqueOrThrow.mockResolvedValue({
      displayName: 'Dra. Ana', logoUrl: null, mealPlanAiInstructions: null,
      defaultCanLogAssessments: true, defaultShowMealTargetToPatient: true,
    } as any);
    const result = await service.getSettings(ctx);
    expect(result.defaultCanLogAssessments).toBe(true);
    expect(result.defaultShowMealTargetToPatient).toBe(true);
  });

  it('updates displayName and mealPlanAiInstructions on the caller profile', async () => {
    prisma.nutritionistProfile.update.mockResolvedValue({
      displayName: 'Dra. Ana', logoUrl: null, mealPlanAiInstructions: 'Sem lactose',
      defaultCanLogAssessments: false, defaultShowMealTargetToPatient: false,
    } as any);
    await service.updateSettings(ctx, { displayName: 'Dra. Ana', mealPlanAiInstructions: 'Sem lactose' });
    expect(prisma.nutritionistProfile.update).toHaveBeenCalledWith({
      where: { id: 'nutri-1' },
      data: {
        displayName: 'Dra. Ana',
        mealPlanAiInstructions: 'Sem lactose',
        defaultCanLogAssessments: undefined,
        defaultShowMealTargetToPatient: undefined,
      },
      select: SELECT,
    });
  });

  it('writes the 2 patient-app defaults on update', async () => {
    prisma.nutritionistProfile.update.mockResolvedValue({
      displayName: null, logoUrl: null, mealPlanAiInstructions: null,
      defaultCanLogAssessments: true, defaultShowMealTargetToPatient: true,
    } as any);
    await service.updateSettings(ctx, {
      defaultCanLogAssessments: true,
      defaultShowMealTargetToPatient: true,
    });
    expect(prisma.nutritionistProfile.update).toHaveBeenCalledWith({
      where: { id: 'nutri-1' },
      data: {
        displayName: undefined,
        mealPlanAiInstructions: undefined,
        defaultCanLogAssessments: true,
        defaultShowMealTargetToPatient: true,
      },
      select: SELECT,
    });
  });

  it('uploads a logo to {id}.{ext} and persists the URL', async () => {
    supabaseAdmin.uploadPublicObject.mockResolvedValue('https://cdn/nutri-1.png');
    prisma.nutritionistProfile.update.mockResolvedValue({
      displayName: null, logoUrl: 'https://cdn/nutri-1.png', mealPlanAiInstructions: null,
    } as any);
    const file = { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), mimetype: 'image/png' };
    const result = await service.uploadLogo(ctx, file);
    expect(supabaseAdmin.uploadPublicObject).toHaveBeenCalledWith(
      'nutritionist-logos', 'nutri-1.png', file.buffer, 'image/png',
    );
    expect(prisma.nutritionistProfile.update).toHaveBeenCalledWith({
      where: { id: 'nutri-1' },
      data: { logoUrl: 'https://cdn/nutri-1.png' },
      select: SELECT,
    });
    expect(result.logoUrl).toBe('https://cdn/nutri-1.png');
  });

  it('rejects a non-image buffer with BadRequestException and does not call uploadPublicObject', async () => {
    const file = { buffer: Buffer.from('not-an-image'), mimetype: 'image/png' };
    await expect(service.uploadLogo(ctx, file)).rejects.toThrow('Arquivo de imagem inválido.');
    expect(supabaseAdmin.uploadPublicObject).not.toHaveBeenCalled();
    expect(prisma.nutritionistProfile.update).not.toHaveBeenCalled();
  });

  it('removes the logo: clears the URL and best-effort deletes the object', async () => {
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ logoUrl: 'https://cdn/nutri-1.png' } as any);
    prisma.nutritionistProfile.update.mockResolvedValue({
      displayName: null, logoUrl: null, mealPlanAiInstructions: null,
    } as any);
    const result = await service.removeLogo(ctx);
    expect(supabaseAdmin.removeObject).toHaveBeenCalledWith('nutritionist-logos', 'nutri-1.png');
    expect(prisma.nutritionistProfile.update).toHaveBeenCalledWith({
      where: { id: 'nutri-1' },
      data: { logoUrl: null },
      select: SELECT,
    });
    expect(result.logoUrl).toBeNull();
  });
});
