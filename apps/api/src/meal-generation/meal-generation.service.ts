import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { MealPlanDraft } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIProvider } from '../ai/openai.provider';
import { MealPlansService, GeneratedMealInput } from '../meal-plans/meal-plans.service';
import { AuthContext } from '../auth/types/auth-context';
import { AIInteractionType } from '../generated/prisma/client';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import {
  computeAge,
  computeTargets,
  NutritionInputs,
  Gender,
  PatientObjective,
  ActivityLevel,
} from '@nutri-plus/shared-types';
import { mealPlanResponseSchema, MealPlanResponse } from './schema/meal-plan-response.schema';
import {
  MEAL_PLAN_SYSTEM_PROMPT,
  buildMealPlanUserPrompt,
} from '../ai/prompts/meal-plan.prompt';
import {
  MEAL_PLAN_ADJUSTMENT_SYSTEM_PROMPT,
  buildMealPlanAdjustmentUserPrompt,
} from '../ai/prompts/meal-plan-adjustment.prompt';

@Injectable()
export class MealGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: OpenAIProvider,
    private readonly mealPlans: MealPlansService,
  ) {}

  async generate(ctx: AuthContext, patientId: string, instructions?: string) {
    const nutritionistId = resolveScopeNutritionistId(ctx);

    // Ownership + data fetch in one scoped query (404 covers missing/not-owned).
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId },
      include: {
        assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 },
      },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const inputs = this.requireInputs(patient);
    const targets = computeTargets(inputs);

    const settings = await this.prisma.nutritionistProfile.findUnique({
      where: { id: nutritionistId },
      select: { mealPlanAiInstructions: true },
    });

    const generated = await this.provider.generateStructured<MealPlanResponse>({
      tier: 'smart',
      system: MEAL_PLAN_SYSTEM_PROMPT,
      user: buildMealPlanUserPrompt({
        age: inputs.age,
        weightKg: inputs.weightKg,
        heightCm: inputs.heightCm,
        gender: inputs.gender,
        objective: inputs.objective,
        activityLevel: inputs.activityLevel,
        restrictions: patient.restrictions ?? null,
        allergies: patient.allergies ?? null,
        medicalConditions: patient.medicalConditions ?? null,
        patientNotes: patient.notes ?? null,
        targets,
        defaultInstructions: settings?.mealPlanAiInstructions ?? null,
        customInstructions: instructions ?? null,
      }),
      schema: mealPlanResponseSchema,
      schemaName: 'meal_plan',
      type: AIInteractionType.MEAL_PLAN_GENERATION,
      patientId,
    });

    return this.mealPlans.createGeneratedPlan(ctx, {
      patientId,
      title: generated.title,
      targets,
      meals: generated.meals.map((m): GeneratedMealInput => ({
        name: m.name,
        timeLabel: m.timeLabel ?? undefined,
        options: m.options.map((o) => ({ label: o.label, items: o.items })),
      })),
    });
  }

  // AI-assisted revision of an EXISTING plan: returns an unpersisted draft
  // (nutritionist reviews and saves via the normal update endpoint). Ownership is
  // enforced by mealPlans.getPlan (404 for missing/not-owned); daily targets and
  // objective are carried over from the existing plan, never recalculated here.
  async adjust(ctx: AuthContext, planId: string, instructions: string): Promise<MealPlanDraft> {
    // Ownership + full tree (404 propagates for missing/not-owned).
    const plan = await this.mealPlans.getPlan(ctx, planId);
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: plan.patientId },
      select: { objective: true, restrictions: true, allergies: true, medicalConditions: true, notes: true },
    });

    const revised = await this.provider.generateStructured<MealPlanResponse>({
      tier: 'smart',
      system: MEAL_PLAN_ADJUSTMENT_SYSTEM_PROMPT,
      user: buildMealPlanAdjustmentUserPrompt({
        currentPlan: {
          title: plan.title,
          meals: plan.meals.map((m) => ({
            name: m.name,
            timeLabel: m.timeLabel,
            instructions: m.instructions,
            options: m.options.map((o) => ({
              label: o.label,
              items: o.items.map((it) => ({
                foodName: it.foodName,
                quantity: it.quantity,
                calories: it.calories,
                protein: it.protein,
                carbs: it.carbs,
                fats: it.fats,
              })),
            })),
          })),
        },
        objective: patient?.objective ?? null,
        restrictions: patient?.restrictions ?? null,
        allergies: patient?.allergies ?? null,
        medicalConditions: patient?.medicalConditions ?? null,
        patientNotes: patient?.notes ?? null,
        targets: {
          calories: plan.targetCalories,
          protein: plan.targetProtein,
          carbs: plan.targetCarbs,
          fats: plan.targetFats,
        },
        instructions,
      }),
      schema: mealPlanResponseSchema,
      schemaName: 'meal_plan',
      type: AIInteractionType.MEAL_PLAN_ADJUSTMENT,
      patientId: plan.patientId,
    });

    return {
      title: revised.title,
      objective: plan.objective ?? undefined,
      targetCalories: plan.targetCalories ?? undefined,
      targetProtein: plan.targetProtein ?? undefined,
      targetCarbs: plan.targetCarbs ?? undefined,
      targetFats: plan.targetFats ?? undefined,
      meals: revised.meals.map((m) => ({
        name: m.name,
        timeLabel: m.timeLabel ?? undefined,
        options: m.options.map((o) => ({ label: o.label, items: o.items })),
      })),
    };
  }

  // Validates that every field the calculation needs is present; otherwise 422
  // listing exactly what is missing. weight + measured BMR come from the latest
  // assessment; the rest from the profile.
  private requireInputs(patient: {
    height: number | null;
    birthDate: Date | null;
    gender: string | null;
    objective: string | null;
    activityLevel: string | null;
    assessments: { weight: number | null; basalMetabolicRate: number | null }[];
  }): NutritionInputs {
    const latest = patient.assessments[0];
    const missing: string[] = [];
    if (latest?.weight == null) missing.push('weight (latest assessment)');
    if (patient.height == null) missing.push('height');
    if (patient.birthDate == null) missing.push('birthDate');
    if (patient.gender == null) missing.push('gender');
    if (patient.objective == null) missing.push('objective');
    if (patient.activityLevel == null) missing.push('activityLevel');
    if (missing.length > 0) {
      throw new UnprocessableEntityException(
        `Cannot generate a plan: missing ${missing.join(', ')}`,
      );
    }

    return {
      weightKg: latest!.weight!,
      heightCm: patient.height!,
      age: computeAge(patient.birthDate!, new Date()),
      gender: patient.gender! as Gender,
      objective: patient.objective! as PatientObjective,
      activityLevel: patient.activityLevel! as ActivityLevel,
      measuredBmr: latest!.basalMetabolicRate,
    };
  }

}
