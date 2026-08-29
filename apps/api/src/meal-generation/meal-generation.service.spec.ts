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
import { AIInteractionType } from '../generated/prisma/client';

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
    medicalConditions: null,
    notes: 'sem nozes; almoço às 12:30',
    assessments: [{ weight: 80, basalMetabolicRate: null }],
  };
}

const aiResponse = {
  title: 'Plano de Emagrecimento',
  meals: [
    {
      name: 'Café da Manhã',
      timeLabel: '08:00',
      options: [
        { label: 'Opção 1', items: [{ foodName: 'Ovo de galinha', quantity: '2 unidades', grams: 100, calories: 140, protein: 12, carbs: 1, fats: 9 }] },
        { label: 'Opção 2', items: [{ foodName: 'Tapioca', quantity: '2 colheres', grams: 60, calories: 150, protein: 11, carbs: 20, fats: 3 }] },
      ],
    },
  ],
};

// Food mockado que casa o item "Ovo de galinha" via matchFood; "Tapioca" não tem
// correspondente no catálogo mockado e deve cair no fallback de texto-livre.
const mockedFood = {
  id: 'food-ovo',
  name: 'Ovo, de galinha, inteiro, cru',
  searchName: 'ovo, de galinha, inteiro, cru',
  energyKcal: 143,
  protein: 13,
  carbohydrate: 1.6,
  lipid: 9,
  fiber: 0,
  sodium: 140,
  tacoId: null,
  group: null,
  createdAt: new Date(),
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
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ mealPlanAiInstructions: 'Evitar ultraprocessados' } as any);
    provider.generateStructured.mockResolvedValue(aiResponse as any);
    prisma.food.findMany.mockResolvedValue([mockedFood] as any);
    mealPlans.createGeneratedPlan.mockResolvedValue({ id: 'mp1' } as any);

    const result = await service.generate(ctx, 'p1');

    // Provider invoked with the smart tier, our schema, and targets in the prompt.
    const call = provider.generateStructured.mock.calls[0][0];
    expect(call.tier).toBe('smart');
    expect(call.type).toBe(AIInteractionType.MEAL_PLAN_GENERATION);
    expect(call.patientId).toBe('p1');
    const userCtx = JSON.parse(call.user);
    expect(userCtx.targets.calories).toBeGreaterThan(0);
    expect(userCtx.targets.protein).toBe(160); // 2.0 g/kg * 80
    expect(userCtx.defaultInstructions).toBe('Evitar ultraprocessados');
    expect(userCtx.customInstructions).toBeNull();
    expect(userCtx.patientNotes).toBe('sem nozes; almoço às 12:30');

    // Loads the food catalog once, after the AI call, before persisting.
    expect(prisma.food.findMany).toHaveBeenCalledTimes(1);

    const persistedArgs = mealPlans.createGeneratedPlan.mock.calls[0][1];
    const items = persistedArgs.meals[0].options;

    // Assertion 1 (anchored): matched item carries foodId + canonical name + grams
    // + macros RECOMPUTED by macrosForPortion — NOT the AI's estimate (140/12/1/9).
    expect(items[0].items[0]).toEqual({
      foodName: 'Ovo, de galinha, inteiro, cru',
      foodId: 'food-ovo',
      grams: 100,
      quantity: '',
      calories: 143,
      protein: 13,
      carbs: 2, // Math.round(1.6)
      fats: 9,
      fiber: 0,
      sodium: 140,
    });

    // Assertion 2 (fallback): unmatched item stays free-text with the AI's estimate,
    // no foodId.
    expect(items[1].items[0]).toEqual({
      foodName: 'Tapioca',
      quantity: '2 colheres',
      calories: 150,
      protein: 11,
      carbs: 20,
      fats: 3,
    });

    // Assertion 3 (targets identical): computeTargets is unchanged by grounding.
    expect(persistedArgs.targets).toEqual(userCtx.targets);
    expect(persistedArgs.patientId).toBe('p1');
    expect(persistedArgs.title).toBe('Plano de Emagrecimento');
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

  it('passes per-call custom instructions and the nutritionist default into the prompt', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(completePatient() as any);
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ mealPlanAiInstructions: 'Evitar ultraprocessados' } as any);
    provider.generateStructured.mockResolvedValue(aiResponse as any);
    prisma.food.findMany.mockResolvedValue([mockedFood] as any);
    mealPlans.createGeneratedPlan.mockResolvedValue({ id: 'mp1' } as any);

    await service.generate(ctx, 'p1', 'Apenas 4 refeições');

    expect(prisma.nutritionistProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'nutri-1' },
      select: { mealPlanAiInstructions: true },
    });
    const userCtx = JSON.parse(provider.generateStructured.mock.calls[0][0].user);
    expect(userCtx.defaultInstructions).toBe('Evitar ultraprocessados');
    expect(userCtx.customInstructions).toBe('Apenas 4 refeições');
  });

  describe('adjust', () => {
    const plan = {
      id: 'm1', patientId: 'p1', title: 'Plano', objective: 'Cutting',
      targetCalories: 1800, targetProtein: 135, targetCarbs: 180, targetFats: 60,
      meals: [{ name: 'Café', timeLabel: '08:00', instructions: null,
        options: [{ label: 'Opção 1', items: [{ foodName: 'Ovos', quantity: '3', calories: 230, protein: 18, carbs: 2, fats: 16 }] }] }],
    };
    const revised = { title: 'Plano', meals: [{ name: 'Café', timeLabel: '08:00', options: [{ label: 'Opção 1', items: [{ foodName: 'Omelete', quantity: '3 ovos', calories: 230, protein: 18, carbs: 2, fats: 16 }] }] }] };

    it('builds context from the plan + patient, calls the provider with MEAL_PLAN_ADJUSTMENT, and returns an unpersisted draft', async () => {
      mealPlans.getPlan.mockResolvedValue(plan as any);
      prisma.patientProfile.findUnique.mockResolvedValue({ objective: 'MUSCLE_GAIN', restrictions: null, allergies: 'amendoim', medicalConditions: null, notes: null } as any);
      provider.generateStructured.mockResolvedValue(revised as any);

      const draft = await service.adjust(ctx, 'm1', 'trocar ovos por omelete');

      expect(mealPlans.getPlan).toHaveBeenCalledWith(ctx, 'm1');
      expect(provider.generateStructured).toHaveBeenCalledWith(
        expect.objectContaining({ type: AIInteractionType.MEAL_PLAN_ADJUSTMENT, tier: 'smart', patientId: 'p1' }),
      );
      // Draft carries the original targets/objective and the revised meals; nothing persisted.
      expect(draft.targetCalories).toBe(1800);
      expect(draft.objective).toBe('Cutting');
      expect(draft.meals[0].options?.[0].items?.[0].foodName).toBe('Omelete');
      expect(mealPlans.createGeneratedPlan).not.toHaveBeenCalled();
      expect(prisma.mealPlan.update).not.toHaveBeenCalled();
    });

    it('propagates 404 from getPlan for a non-owned plan', async () => {
      mealPlans.getPlan.mockRejectedValue(new NotFoundException('Meal plan not found'));
      await expect(service.adjust(ctx, 'm1', 'x')).rejects.toMatchObject({ status: 404 });
      expect(provider.generateStructured).not.toHaveBeenCalled();
    });
  });
});
