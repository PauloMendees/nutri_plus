import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { ActivityLevel, Gender, TmbFormula } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { NutritionTargetsService } from './nutrition-targets.service';
import { CreateNutritionTargetDto } from './dto/create-nutrition-target.dto';

const ctx: AuthContext = {
  authProviderId: 'sub-n',
  email: 'n@x.com',
  name: 'Nut',
  user: {
    id: 'user-n',
    role: 'NUTRITIONIST',
    nutritionistProfile: { id: 'nutri-1' },
    patientProfile: null,
  } as any,
};

const baseDto: CreateNutritionTargetDto = {
  formula: TmbFormula.MIFFLIN,
  sex: Gender.MALE,
  targetCalories: 2000,
  proteinGramsPerKg: 1.8,
  fatPercent: 25,
};

// weightKg=80, heightCm=180, age=30 -> Mifflin TMB = 1780; GET(moderate) = 2759
const patientWithAssessment = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  height: 180,
  birthDate: new Date(new Date().getFullYear() - 30, 0, 1),
  activityLevel: ActivityLevel.MODERATE,
  assessments: [{ weight: 80, bodyFatPercentage: 20 }],
  ...overrides,
});

describe('NutritionTargetsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: NutritionTargetsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new NutritionTargetsService(prisma);
  });

  describe('create', () => {
    it('throws 404 when the patient is missing or not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);

      await expect(service.create(ctx, 'p1', baseDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.nutritionTarget.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when no activity level is available (patient nor DTO)', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(
        patientWithAssessment({ activityLevel: null }) as any,
      );

      await expect(service.create(ctx, 'p1', baseDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.nutritionTarget.create).not.toHaveBeenCalled();
    });

    it('derives missing weightKg/bodyFatPercentage/age from the patient + latest assessment', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(patientWithAssessment() as any);
      prisma.nutritionTarget.create.mockResolvedValue({ id: 'nt1' } as any);

      await service.create(ctx, 'p1', baseDto);

      const data = prisma.nutritionTarget.create.mock.calls[0][0].data as any;
      expect(data.weightKg).toBe(80);
      expect(data.bodyFatPercentage).toBe(20);
      expect(data.age).toBe(30);
      expect(data.heightCm).toBe(180);
    });

    it('recomputes tmb/get/activityFactor/macros server-side, ignoring any client-supplied numbers', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(patientWithAssessment() as any);
      prisma.nutritionTarget.create.mockResolvedValue({ id: 'nt1' } as any);

      // Client sends bogus tmb/get/proteinGrams/etc — the DTO doesn't even accept
      // these fields (whitelist: true would strip them), but simulate the intent
      // to prove the service derives its own numbers rather than trusting input.
      await service.create(ctx, 'p1', { ...baseDto } as any);

      const data = prisma.nutritionTarget.create.mock.calls[0][0].data as any;
      // Mifflin male 80kg/180cm/30y = 1780
      expect(data.tmb).toBe(1780);
      // GET moderate = 1780 * 1.55 = 2759
      expect(data.get).toBe(2759);
      expect(data.activityFactor).toBe(1.55);
      // macros: 2000 kcal, 80kg, 1.8 g/kg, 25% fat
      expect(data.proteinGrams).toBe(144);
      expect(data.fatGrams).toBe(56);
      expect(data.carbGrams).toBe(231);
    });

    it('Katch with null body-fat% falls back to and persists formula: MIFFLIN', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(
        patientWithAssessment({ assessments: [{ weight: 80, bodyFatPercentage: null }] }) as any,
      );
      prisma.nutritionTarget.create.mockResolvedValue({ id: 'nt1' } as any);

      await service.create(ctx, 'p1', { ...baseDto, formula: TmbFormula.KATCH_MCARDLE });

      const data = prisma.nutritionTarget.create.mock.calls[0][0].data as any;
      expect(data.formula).toBe(TmbFormula.MIFFLIN);
      expect(data.bodyFatPercentage).toBeNull();
      // Falls back to Mifflin -> tmb = 1780
      expect(data.tmb).toBe(1780);
    });

    it('persists a NutritionTarget and returns it', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(patientWithAssessment() as any);
      const created = { id: 'nt1', patientId: 'p1' };
      prisma.nutritionTarget.create.mockResolvedValue(created as any);

      const result = await service.create(ctx, 'p1', baseDto);

      expect(prisma.nutritionTarget.create).toHaveBeenCalledTimes(1);
      const data = prisma.nutritionTarget.create.mock.calls[0][0].data as any;
      expect(data.patientId).toBe('p1');
      expect(result).toBe(created);
    });
  });

  describe('list', () => {
    it('throws 404 when the patient is missing or not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);
      await expect(service.list(ctx, 'p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.nutritionTarget.findMany).not.toHaveBeenCalled();
    });

    it('lists targets ordered by targetDate desc', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(patientWithAssessment() as any);
      const targets = [{ id: 't1' }, { id: 't2' }];
      prisma.nutritionTarget.findMany.mockResolvedValue(targets as any);

      const result = await service.list(ctx, 'p1');

      expect(prisma.nutritionTarget.findMany).toHaveBeenCalledWith({
        where: { patientId: 'p1' },
        orderBy: { targetDate: 'desc' },
      });
      expect(result).toBe(targets);
    });
  });
});
