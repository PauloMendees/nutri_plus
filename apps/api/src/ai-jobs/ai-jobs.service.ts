import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AI_JOB_STUCK_AFTER_MS, isAiJobStuck, type AiJobDetail, type AiJobType, type AiJobView } from '@nutri-plus/shared-types';
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
    // Espelha a checagem de posse de createForPlan: sem isto, um patientId
    // inexistente ou de outro nutricionista estoura a FK do Prisma (P2003) e
    // vira 500 em vez de 404.
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: args.patientId, nutritionistId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Paciente não encontrado.');
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
        // Semântica dupla desta coluna: na geração é o plano PRODUZIDO (gravado
        // ao concluir); no ajuste é o plano AJUSTADO, conhecido já na criação.
        // É o que permite a faixa do editor saber a qual plano o ajuste pertence.
        mealPlanId: args.planId ?? null,
      },
      select: { id: true },
    });

    void this.runJob(job.id);
    return { jobId: job.id };
  }

  // Fire-and-forget: NUNCA lança. É chamado com `void`, sem catch no chamador —
  // um throw aqui vira unhandled rejection e derruba o processo.
  async runJob(jobId: string): Promise<void> {
    try {
      // Claim atômico PENDING -> RUNNING: só quem vence a corrida executa. Sem
      // isto, um retry de job "travado" cujo runJob original ainda está vivo
      // dispara uma segunda geração — dois planos e custo de IA dobrado.
      const claim = await this.prisma.aiJob.updateMany({
        where: { id: jobId, status: 'PENDING' },
        data: { status: 'RUNNING', startedAt: new Date(), error: null },
      });
      if (claim.count === 0) return;

      const job = await this.prisma.aiJob.findFirst({ where: { id: jobId } });
      if (!job) return;

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
          // Mensagem útil em vez de um erro interno do Prisma sobre id undefined.
          if (!input.planId) throw new Error('Job de ajuste sem planId');
          const draft = await this.generation.adjust(ctx, input.planId, input.instructions ?? '');
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
    } catch (outer) {
      // Última linha de defesa: banco indisponível no claim, na leitura ou na
      // própria gravação de FAILED. Loga e engole — o job aparece travado no
      // painel e a nutricionista repete.
      this.logger.error(
        `AiJob ${jobId}: falha ao gerenciar o próprio estado — ${outer instanceof Error ? outer.message : String(outer)}`,
      );
    }
  }

  async get(ctx: AuthContext, jobId: string): Promise<AiJobDetail> {
    const job = await this.requireOwned(ctx, jobId);
    return { ...this.toView(job), result: (job.result as MealPlanDraft | null) ?? null, consumedAt: job.consumedAt?.toISOString() ?? null };
  }

  // `patientId` opcional: sem ele, lista os trabalhos do nutricionista inteiro,
  // que é o que o widget global consome fora da página do paciente.
  async list(ctx: AuthContext, patientId?: string): Promise<AiJobView[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const jobs = await this.prisma.aiJob.findMany({
      where: {
        nutritionistId: resolveScopeNutritionistId(ctx),
        ...(patientId ? { patientId } : {}),
        OR: [
          { status: { in: ['PENDING', 'RUNNING'] } },
          { status: 'FAILED', createdAt: { gte: since } },
          // Ajuste concluído e ainda não revisado: é o que alimenta a faixa
          // "Ajuste pronto" no editor (Task 10).
          { status: 'DONE', type: 'MEAL_PLAN_ADJUSTMENT', consumedAt: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: { patient: { select: { user: { select: { name: true } } } } },
    });
    return jobs.map((j) => this.toView(j));
  }

  async retry(ctx: AuthContext, jobId: string): Promise<{ jobId: string }> {
    const job = await this.requireOwned(ctx, jobId);
    const startedAt = job.startedAt?.toISOString() ?? null;
    // PENDING órfão (processo morreu antes de executar) também precisa de saída:
    // ele conta contra a cota do mês e isAiJobStuck só enxerga RUNNING.
    const orphanPending =
      job.status === 'PENDING' && Date.now() - job.createdAt.getTime() > AI_JOB_STUCK_AFTER_MS;
    const stuck = isAiJobStuck({ status: job.status, startedAt }, new Date()) || orphanPending;
    if (job.status !== 'FAILED' && !stuck) {
      throw new ConflictException('Este trabalho não pode ser repetido agora.');
    }

    // Só o ramo FAILED precisa de cota: um job travado ainda é PENDING/RUNNING,
    // então já está contado, e verificar de novo o faria rejeitar a si mesmo.
    if (job.status === 'FAILED') {
      await this.entitlements.assertAiActionQuota(resolveScopeNutritionistId(ctx));
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
      include: { patient: { select: { user: { select: { name: true } } } } },
    });
    // 404 e não 403: não revelamos a existência de job de outro nutricionista.
    if (!job) throw new NotFoundException('Trabalho não encontrado.');
    return job;
  }

  private toView(job: {
    id: string; type: string; status: string; patientId: string;
    mealPlanId: string | null; error: string | null;
    createdAt: Date; startedAt: Date | null; finishedAt: Date | null;
    patient?: { user: { name: string } } | null;
  }): AiJobView {
    const startedAt = job.startedAt?.toISOString() ?? null;
    const status = job.status as AiJobView['status'];
    return {
      id: job.id,
      type: job.type as AiJobType,
      status,
      patientId: job.patientId,
      patientName: job.patient?.user.name ?? '',
      mealPlanId: job.mealPlanId,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      startedAt,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      isStuck: isAiJobStuck({ status, startedAt }, new Date()),
    };
  }
}
