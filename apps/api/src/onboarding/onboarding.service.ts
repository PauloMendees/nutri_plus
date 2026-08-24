import { BadRequestException, Injectable } from '@nestjs/common';
import {
  isOnboardingTourId,
  type OnboardingMeView,
  type OnboardingTourProgressView,
  type PatchOnboardingTourRequest,
} from '@nutri-plus/shared-types';
import type { OnboardingChapterProgress, OnboardingProgress } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ProgressWithChapters = OnboardingProgress & { chapters: OnboardingChapterProgress[] };

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function isTerminalChapter(status: string): boolean {
  return status === 'COMPLETED' || status === 'SKIPPED';
}

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string): Promise<OnboardingMeView> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { onboardingPromptDismissedAt: true },
    });
    const tours = await this.loadTours(userId);
    return this.toView(user.onboardingPromptDismissedAt, tours);
  }

  async dismissPrompt(userId: string): Promise<OnboardingMeView> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { onboardingPromptDismissedAt: true },
    });
    let dismissedAt = user.onboardingPromptDismissedAt;
    if (!dismissedAt) {
      const now = new Date();
      await this.prisma.user.update({
        where: { id: userId },
        data: { onboardingPromptDismissedAt: now },
      });
      dismissedAt = now;
    }
    const tours = await this.loadTours(userId);
    return this.toView(dismissedAt, tours);
  }

  async patchTour(
    userId: string,
    tourId: string,
    dto: PatchOnboardingTourRequest,
  ): Promise<OnboardingMeView> {
    if (!isOnboardingTourId(tourId)) {
      throw new BadRequestException('Unknown tour');
    }

    let progress = await this.prisma.onboardingProgress.findUnique({
      where: { userId_tourId: { userId, tourId } },
      include: { chapters: true },
    });

    if (progress?.status === 'COMPLETED') {
      if (dto.chapterId) {
        const existing = progress.chapters.find((c) => c.chapterId === dto.chapterId);
        this.assertTerminalChapterUnchanged(existing, dto, 'tour');
      }
      const refData: {
        demoPatientId?: string | null;
        demoAppointmentId?: string | null;
        demoTransactionId?: string | null;
      } = {};
      if (dto.demoPatientId !== undefined && progress.demoPatientId !== dto.demoPatientId) {
        refData.demoPatientId = dto.demoPatientId;
      }
      if (
        dto.demoAppointmentId !== undefined &&
        progress.demoAppointmentId !== dto.demoAppointmentId
      ) {
        refData.demoAppointmentId = dto.demoAppointmentId;
      }
      if (
        dto.demoTransactionId !== undefined &&
        progress.demoTransactionId !== dto.demoTransactionId
      ) {
        refData.demoTransactionId = dto.demoTransactionId;
      }
      if (Object.keys(refData).length > 0) {
        await this.prisma.onboardingProgress.update({ where: { id: progress.id }, data: refData });
      }
      return this.getMine(userId);
    }

    const existed = progress != null;
    if (!progress) {
      const hasWrite =
        !!dto.chapterId ||
        dto.demoPatientId !== undefined ||
        dto.demoAppointmentId !== undefined ||
        dto.demoTransactionId !== undefined ||
        dto.tourStatus === 'COMPLETED';
      if (!hasWrite) return this.getMine(userId);

      progress = await this.prisma.onboardingProgress.upsert({
        where: { userId_tourId: { userId, tourId } },
        create: {
          userId,
          tourId,
          status: dto.tourStatus === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
          completedAt: dto.tourStatus === 'COMPLETED' ? new Date() : null,
          demoPatientId: dto.demoPatientId ?? undefined,
          demoAppointmentId: dto.demoAppointmentId ?? undefined,
          demoTransactionId: dto.demoTransactionId ?? undefined,
        },
        update: {},
        include: { chapters: true },
      });
    }

    if (dto.chapterId) {
      await this.patchChapter(progress, dto);
    }

    if (existed) {
      const data: {
        demoPatientId?: string | null;
        demoAppointmentId?: string | null;
        demoTransactionId?: string | null;
        status?: 'COMPLETED';
        completedAt?: Date;
      } = {};
      if (dto.demoPatientId !== undefined) data.demoPatientId = dto.demoPatientId;
      if (dto.demoAppointmentId !== undefined) data.demoAppointmentId = dto.demoAppointmentId;
      if (dto.demoTransactionId !== undefined) data.demoTransactionId = dto.demoTransactionId;
      if (dto.tourStatus === 'COMPLETED' && progress.status !== 'COMPLETED') {
        data.status = 'COMPLETED';
        data.completedAt = new Date();
      }
      if (Object.keys(data).length > 0) {
        await this.prisma.onboardingProgress.update({
          where: { id: progress.id },
          data,
        });
      }
    }

    return this.getMine(userId);
  }

  private async patchChapter(
    progress: ProgressWithChapters,
    dto: PatchOnboardingTourRequest,
  ): Promise<void> {
    const chapterId = dto.chapterId!;
    const existing = progress.chapters.find((c) => c.chapterId === chapterId);
    if (existing && isTerminalChapter(existing.status)) {
      this.assertTerminalChapterUnchanged(existing, dto, 'chapter');
      return;
    }

    const status = dto.chapterStatus ?? existing?.status ?? 'IN_PROGRESS';
    const furthestStepId =
      dto.furthestStepId !== undefined ? dto.furthestStepId : (existing?.furthestStepId ?? null);
    const becomingTerminal = isTerminalChapter(status);

    await this.prisma.onboardingChapterProgress.upsert({
      where: { progressId_chapterId: { progressId: progress.id, chapterId } },
      create: {
        progressId: progress.id,
        chapterId,
        status,
        furthestStepId,
        completedAt: becomingTerminal ? new Date() : null,
      },
      update: {
        status,
        furthestStepId,
        ...(becomingTerminal && !existing?.completedAt ? { completedAt: new Date() } : {}),
      },
    });
  }

  private assertTerminalChapterUnchanged(
    existing: OnboardingChapterProgress | undefined,
    dto: PatchOnboardingTourRequest,
    kind: 'chapter' | 'tour',
  ): void {
    if (!existing || !isTerminalChapter(existing.status)) {
      throw new BadRequestException(
        kind === 'tour' ? 'Cannot reopen a completed tour' : 'Cannot mutate a completed chapter',
      );
    }
    if (dto.chapterStatus !== undefined && dto.chapterStatus !== existing.status) {
      throw new BadRequestException('Cannot mutate a completed chapter');
    }
    if (dto.furthestStepId !== undefined && dto.furthestStepId !== existing.furthestStepId) {
      throw new BadRequestException('Cannot mutate a completed chapter');
    }
  }

  private loadTours(userId: string): Promise<ProgressWithChapters[]> {
    return this.prisma.onboardingProgress.findMany({
      where: { userId },
      include: { chapters: true },
    });
  }

  private toView(
    promptDismissedAt: Date | null,
    tours: ProgressWithChapters[],
  ): OnboardingMeView {
    return {
      promptDismissedAt: iso(promptDismissedAt),
      tours: tours.map((tour): OnboardingTourProgressView => ({
        tourId: tour.tourId,
        status: tour.status,
        demoPatientId: tour.demoPatientId,
        demoAppointmentId: tour.demoAppointmentId,
        demoTransactionId: tour.demoTransactionId,
        completedAt: iso(tour.completedAt),
        chapters: tour.chapters.map((chapter) => ({
          chapterId: chapter.chapterId,
          status: chapter.status,
          furthestStepId: chapter.furthestStepId,
          completedAt: iso(chapter.completedAt),
        })),
      })),
    };
  }
}
