import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FEEDBACK_SNOOZE_MS,
  NUTRITIONIST_PROMPT_DELAY_MS,
  PATIENT_PROMPT_DELAY_MS,
  type FeedbackPromptResponse,
  type FeedbackSource,
  type SubmitFeedbackRequest,
  type SubmitFeedbackResponse,
  type DismissFeedbackResponse,
} from '@nutri-plus/shared-types';
import { UserRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { ResendService } from '../support/resend.service';

function sourceFor(role: UserRole): FeedbackSource {
  return role === UserRole.PATIENT ? 'MOBILE' : 'WEB';
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly resend: ResendService,
  ) {}

  async getPrompt(ctx: AuthContext): Promise<FeedbackPromptResponse> {
    const user = ctx.user!;
    const source = sourceFor(user.role);
    if (user.role === UserRole.EMPLOYEE) {
      return { shouldShow: false, source };
    }

    const row = await this.prisma.userFeedback.findUnique({ where: { userId: user.id } });
    if (row?.resolvedAt) return { shouldShow: false, source };
    if (row?.snoozedUntil && row.snoozedUntil > new Date()) {
      return { shouldShow: false, source };
    }

    if (user.role === UserRole.NUTRITIONIST) {
      const readyAt = new Date(user.createdAt.getTime() + NUTRITIONIST_PROMPT_DELAY_MS);
      return { shouldShow: new Date() >= readyAt, source };
    }

    const profile = user.patientProfile;
    if (!profile) return { shouldShow: false, source };
    if (!profile.firstAppLoginAt) {
      const now = new Date();
      await this.prisma.patientProfile.update({
        where: { id: profile.id },
        data: { firstAppLoginAt: now },
      });
      return { shouldShow: false, source };
    }
    const readyAt = new Date(profile.firstAppLoginAt.getTime() + PATIENT_PROMPT_DELAY_MS);
    return { shouldShow: new Date() >= readyAt, source };
  }

  async dismiss(ctx: AuthContext): Promise<DismissFeedbackResponse> {
    const user = ctx.user!;
    if (user.role === UserRole.EMPLOYEE) throw new ForbiddenException();

    const row = await this.prisma.userFeedback.findUnique({ where: { userId: user.id } });
    if (row?.resolvedAt) throw new ConflictException('Feedback already resolved');

    const now = new Date();
    if (!row || row.dismissCount === 0) {
      await this.prisma.userFeedback.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          dismissCount: 1,
          snoozedUntil: new Date(now.getTime() + FEEDBACK_SNOOZE_MS),
        },
        update: {
          dismissCount: 1,
          snoozedUntil: new Date(now.getTime() + FEEDBACK_SNOOZE_MS),
        },
      });
      return { ok: true };
    }

    await this.prisma.userFeedback.update({
      where: { userId: user.id },
      data: { dismissCount: 2, resolvedAt: now },
    });
    return { ok: true };
  }

  async submit(_ctx: AuthContext, _dto: SubmitFeedbackRequest): Promise<SubmitFeedbackResponse> {
    throw new Error('not implemented');
  }
}
