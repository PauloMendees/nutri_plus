import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ActivityLevel,
  computeGet,
  computeMacros,
  computeTmb,
  effectiveFormula,
  activityFactor,
  ageFromBirthDate,
} from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId, resolveScopePatientId } from '../auth/auth-scope';
import { CreateNutritionTargetDto } from './dto/create-nutrition-target.dto';

const round = (n: number) => Math.round(n);

@Injectable()
export class NutritionTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireOwnedPatient(ctx: AuthContext, patientId: string) {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId: resolveScopeNutritionistId(ctx) },
      include: { assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 } },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async create(ctx: AuthContext, patientId: string, dto: CreateNutritionTargetDto) {
    const patient = await this.requireOwnedPatient(ctx, patientId);
    const latest = patient.assessments[0];

    const weightKg = dto.weightKg ?? latest?.weight ?? null;
    const heightCm = dto.heightCm ?? patient.height ?? null;
    const age = dto.age ?? ageFromBirthDate(patient.birthDate) ?? null;
    const bodyFatPercentage = dto.bodyFatPercentage ?? latest?.bodyFatPercentage ?? null;
    // patient.activityLevel comes from the Prisma-generated enum (a plain string
    // union), not the shared-types string enum the calc functions expect — the
    // values are identical at runtime, so this is a safe boundary cast.
    const activityLevelValue =
      dto.activityLevel ?? (patient.activityLevel as ActivityLevel | null) ?? null;

    if (weightKg == null || heightCm == null || age == null || activityLevelValue == null) {
      throw new BadRequestException(
        'Dados insuficientes para calcular a meta: peso, altura, idade e nível de atividade são obrigatórios.',
      );
    }

    // Server recomputes everything — client numbers are never trusted.
    const formula = effectiveFormula(dto.formula, bodyFatPercentage);
    const tmb = computeTmb({ formula, sex: dto.sex, weightKg, heightCm, age, bodyFatPercentage });
    const factor = activityFactor(activityLevelValue);
    const get = computeGet(tmb, activityLevelValue);
    const macros = computeMacros({
      targetCalories: dto.targetCalories,
      weightKg: weightKg ?? 0,
      proteinGramsPerKg: dto.proteinGramsPerKg,
      fatPercent: dto.fatPercent,
    });

    return this.prisma.nutritionTarget.create({
      data: {
        patientId,
        formula,
        sex: dto.sex,
        age,
        heightCm,
        weightKg,
        bodyFatPercentage,
        activityLevel: activityLevelValue,
        activityFactor: factor,
        tmb: round(tmb),
        get: round(get),
        targetCalories: round(dto.targetCalories),
        proteinGramsPerKg: dto.proteinGramsPerKg,
        proteinGrams: macros.proteinGrams,
        fatPercent: dto.fatPercent,
        fatGrams: macros.fatGrams,
        carbGrams: macros.carbGrams,
      },
    });
  }

  async list(ctx: AuthContext, patientId: string) {
    await this.requireOwnedPatient(ctx, patientId);
    return this.prisma.nutritionTarget.findMany({
      where: { patientId },
      orderBy: { targetDate: 'desc' },
    });
  }

  // Patient-facing: a strict safe subset of the latest target, or null. Never
  // exposes tmb/get/formula/activityFactor/inputs — only the 4 numbers the
  // patient app needs to render a meal target. Hidden entirely when the
  // patient's own showMealTargetToPatient toggle is off, or when there is no
  // target yet.
  async getMineForPatient(ctx: AuthContext): Promise<{
    targetCalories: number;
    proteinGrams: number;
    carbGrams: number;
    fatGrams: number;
  } | null> {
    const patientId = resolveScopePatientId(ctx);
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { showMealTargetToPatient: true },
    });
    if (!patient?.showMealTargetToPatient) return null;
    const latest = await this.prisma.nutritionTarget.findFirst({
      where: { patientId },
      orderBy: { targetDate: 'desc' },
    });
    if (!latest) return null;
    return {
      targetCalories: latest.targetCalories,
      proteinGrams: latest.proteinGrams,
      carbGrams: latest.carbGrams,
      fatGrams: latest.fatGrams,
    };
  }
}
