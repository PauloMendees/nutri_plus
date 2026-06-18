import {
  BadGatewayException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIProvider } from '../ai/openai.provider';
import { MealPlansService } from '../meal-plans/meal-plans.service';
import { MealGenerationService } from './meal-generation.service';
import { AuthContext } from '../auth/types/auth-context';

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

// A patient with everything needed to calculate.
function completePatient() {
  return {
    id: 'p1',
    height: 180,
    birthDate: new Date('1994-01-01'),
    gender: 'MALE',
    objective: 'WEIGHT_LOSS',
    activityLevel: 'MODERATE',
    restrictions: 'lactose',
    allergies: null,
    assessments: [{ weight: 80, basalMetabolicRate: null }],
  };
}

const aiResponse = {
  title: 'Weight Loss Plan',
  meals: [
    {
      name: 'Breakfast',
      timeLabel: '08:00',
      items: [{ foodName: 'Eggs', quantity: '2 units' }],
    },
  ],
};

describe('MealGenerationService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let provider: DeepMockProxy<OpenAIProvider>;
  let mealPlans: DeepMockProxy<MealPlansService>;
  let service: MealGenerationService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    provider = mockDeep<OpenAIProvider>();
    mealPlans = mockDeep<MealPlansService>();
    service = new MealGenerationService(prisma, provider, mealPlans);
  });

  it('throws NotFound when the patient is missing or not owned', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);

    await expect(service.generate(ctx, 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', nutritionistId: 'nutri-1' },
      include: { assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 } },
    });
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it('throws 422 naming each missing required field', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({
      id: 'p1',
      height: null,
      birthDate: null,
      gender: null,
      objective: null,
      activityLevel: null,
      restrictions: null,
      allergies: null,
      assessments: [], // no weight
    } as any);

    const err = await service.generate(ctx, 'p1').catch((e) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.message).toMatch(/weight/);
    expect(err.message).toMatch(/height/);
    expect(err.message).toMatch(/birthDate/);
    expect(err.message).toMatch(/gender/);
    expect(err.message).toMatch(/objective/);
    expect(err.message).toMatch(/activityLevel/);
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it('generates with computed targets and persists via createGeneratedPlan', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(completePatient() as any);
    provider.generateStructured.mockResolvedValue(aiResponse as any);
    mealPlans.createGeneratedPlan.mockResolvedValue({ id: 'mp1' } as any);

    const result = await service.generate(ctx, 'p1');

    // Provider invoked with the smart tier, our schema, and targets in the prompt.
    const call = provider.generateStructured.mock.calls[0][0];
    expect(call.tier).toBe('smart');
    expect(call.type).toBe('MEAL_PLAN_GENERATION');
    expect(call.patientId).toBe('p1');
    const userCtx = JSON.parse(call.user);
    expect(userCtx.targets.calories).toBeGreaterThan(0);
    expect(userCtx.targets.protein).toBe(160); // 2.0 g/kg * 80

    // Persistence delegated with aiGenerated targets + normalized tree.
    expect(mealPlans.createGeneratedPlan).toHaveBeenCalledWith(ctx, {
      patientId: 'p1',
      title: 'Weight Loss Plan',
      targets: userCtx.targets,
      meals: [
        {
          name: 'Breakfast',
          timeLabel: '08:00',
          items: [{ foodName: 'Eggs', quantity: '2 units' }],
        },
      ],
    });
    expect(result).toEqual({ id: 'mp1' });
  });

  it('propagates a provider failure and does not persist', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(completePatient() as any);
    provider.generateStructured.mockRejectedValue(
      new BadGatewayException('AI provider unavailable'),
    );

    await expect(service.generate(ctx, 'p1')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(mealPlans.createGeneratedPlan).not.toHaveBeenCalled();
  });
});
