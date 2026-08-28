import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { isAiJobStuck, type AiJobDetail, type AiJobType, type AiJobView } from '@nutri-plus/shared-types';
import type { MealPlanDraft } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { MealGenerationService } from '../meal-generation/meal-generation.service';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import type { AuthContext } from '../auth/types/auth-context';

interface JobInput {
  planId?: string;
  instructions?: string;
}

@Injectable()
export class AiJobsService {
  private readonly logger = new Logger(AiJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly generation: MealGenerationService,
  ) {}

  // O ajuste chega com planId, mas o painel filtra por paciente — derivamos o
  // dono aqui em vez de deixar patientId opcional no modelo.
  async createForPlan(
    ctx: AuthContext,
    planId: string,
    instructions: string,
  ): Promise<{ jobId: string }> {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id: planId, patient: { nutritionistId: resolveScopeNutritionistId(ctx) } },
      select: { patientId: true },
    });
    if (!plan) throw new NotFoundException('Plano não encontrado.');
    return this.create(ctx, {
      type: 'MEAL_PLAN_ADJUSTMENT',
      patientId: plan.patientId,
      planId,
      instructions,
    });
  }

  async create(
    ctx: AuthContext,
    args: { type: AiJobType; patientId: string; planId?: string; instructions?: string },
  ): Promise<{ jobId: string }> {
    // NUTRITIONIST usa o próprio perfil; EMPLOYEE age no escopo do nutricionista
    // dono. O resolver é a única fonte disso no projeto.
    const nutritionistId = resolveScopeNutritionistId(ctx);
    // Antes de gravar: um job PENDING já conta contra a cota (Task 4), então
    // verificar aqui é o que impede enfileirar acima do teto.
    await this.entitlements.assertAiActionQuota(nutritionistId);

    const input: JobInput = { planId: args.planId, instructions: args.instructions };
    const job = await this.prisma.aiJob.create({
      data: {
        nutritionistId,
        patientId: args.patientId,
        type: args.type,
        input: input as object,
      },
      select: { id: true },
    });

    void this.runJob(job.id);
    return { jobId: job.id };
  }

  // Fire-and-forget: nunca lança. Todo erro vira status FAILED no banco, que é
  // o que o painel do paciente lê.
  async runJob(jobId: string): Promise<void> {
    const job = await this.prisma.aiJob.findFirst({ where: { id: jobId } });
    if (!job || job.status === 'RUNNING' || job.status === 'DONE') return;

    await this.prisma.aiJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date(), error: null },
    });

    const input = (job.input ?? {}) as JobInput;

    try {
      // Reconstruímos um AuthContext de verdade a partir do dono gravado no job,
      // para reusar as checagens de posse dos serviços em vez de duplicá-las.
      // Dentro do try: se o dono sumiu, o job vira FAILED em vez de lançar.
      const ctx = await this.contextForJob(job.nutritionistId);

      if (job.type === 'MEAL_PLAN_GENERATION') {
        const plan = await this.generation.generate(ctx, job.patientId, input.instructions);
        await this.prisma.aiJob.update({
          where: { id: jobId },
          data: { status: 'DONE', mealPlanId: plan.id, finishedAt: new Date() },
        });
      } else {
        const draft = await this.generation.adjust(ctx, input.planId!, input.instructions ?? '');
        await this.prisma.aiJob.update({
          where: { id: jobId },
          data: { status: 'DONE', result: draft as object, finishedAt: new Date() },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha inesperada';
      await this.prisma.aiJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: message.slice(0, 500), finishedAt: new Date() },
      });
      this.logger.warn(`AiJob ${jobId} falhou (type=${job.type})`);
    }
  }

  async get(ctx: AuthContext, jobId: string): Promise<AiJobDetail> {
    const job = await this.requireOwned(ctx, jobId);
    return { ...this.toView(job), result: (job.result as MealPlanDraft | null) ?? null, consumedAt: job.consumedAt?.toISOString() ?? null };
  }

  async listForPatient(ctx: AuthContext, patientId: string): Promise<AiJobView[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const jobs = await this.prisma.aiJob.findMany({
      where: {
        nutritionistId: resolveScopeNutritionistId(ctx),
        patientId,
        OR: [
          { status: { in: ['PENDING', 'RUNNING'] } },
          { status: 'FAILED', createdAt: { gte: since } },
          // Ajuste concluído e ainda não revisado: é o que alimenta a faixa
          // "Ajuste pronto" no editor (Task 10).
          { status: 'DONE', type: 'MEAL_PLAN_ADJUSTMENT', consumedAt: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    return jobs.map((j) => this.toView(j));
  }

  async retry(ctx: AuthContext, jobId: string): Promise<{ jobId: string }> {
    const job = await this.requireOwned(ctx, jobId);
    const stuck = isAiJobStuck(
      { status: job.status, startedAt: job.startedAt?.toISOString() ?? null },
      new Date(),
    );
    if (job.status !== 'FAILED' && !stuck) {
      throw new ConflictException('Este trabalho não pode ser repetido agora.');
    }

    await this.prisma.aiJob.update({
      where: { id: jobId },
      data: { status: 'PENDING', error: null, startedAt: null, finishedAt: null },
    });
    void this.runJob(jobId);
    return { jobId };
  }

  async markConsumed(ctx: AuthContext, jobId: string): Promise<void> {
    await this.requireOwned(ctx, jobId);
    await this.prisma.aiJob.update({ where: { id: jobId }, data: { consumedAt: new Date() } });
  }

  private async contextForJob(nutritionistId: string): Promise<AuthContext> {
    const user = await this.prisma.user.findFirst({
      where: { nutritionistProfile: { id: nutritionistId } },
      include: { nutritionistProfile: true, patientProfile: true, employeeProfile: true },
    });
    if (!user) throw new Error(`Nutricionista ${nutritionistId} não encontrado`);
    return { authProviderId: user.authProviderId, email: user.email, name: user.name, user };
  }

  private async requireOwned(ctx: AuthContext, jobId: string) {
    const job = await this.prisma.aiJob.findFirst({
      where: { id: jobId, nutritionistId: resolveScopeNutritionistId(ctx) },
    });
    // 404 e não 403: não revelamos a existência de job de outro nutricionista.
    if (!job) throw new NotFoundException('Trabalho não encontrado.');
    return job;
  }

  private toView(job: {
    id: string; type: string; status: string; patientId: string;
    mealPlanId: string | null; error: string | null;
    createdAt: Date; startedAt: Date | null; finishedAt: Date | null;
  }): AiJobView {
    const startedAt = job.startedAt?.toISOString() ?? null;
    const status = job.status as AiJobView['status'];
    return {
      id: job.id,
      type: job.type as AiJobType,
      status,
      patientId: job.patientId,
      mealPlanId: job.mealPlanId,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      startedAt,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      isStuck: isAiJobStuck({ status, startedAt }, new Date()),
    };
  }
}
