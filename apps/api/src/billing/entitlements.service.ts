import { Injectable } from '@nestjs/common';
import type { Entitlements, PlanTier } from '@nutri-plus/shared-types';
import { PLAN_CATALOG } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AIInteractionType } from '../generated/prisma/client';
import { entitlementsForTier, saoPauloMonthStart } from './plan-policy';
import { PaymentRequiredException } from './payment-required.exception';

const AI_ACTION_TYPES = [
  AIInteractionType.MEAL_PLAN_GENERATION,
  AIInteractionType.MEAL_PLAN_ADJUSTMENT,
];

interface DerivedAccess {
  tier: PlanTier;
  isReadOnly: boolean;
}

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEntitlements(nutritionistId: string): Promise<Entitlements> {
    const access = await this.resolveAccess(nutritionistId);
    const aiUsed = await this.countAiActions(nutritionistId);
    return { ...entitlementsForTier(access.tier, aiUsed), isReadOnly: access.isReadOnly };
  }

  async assertAiActionQuota(nutritionistId: string): Promise<void> {
    const { tier } = await this.resolveAccess(nutritionistId);
    const used = await this.countAiActions(nutritionistId);
    if (used >= PLAN_CATALOG[tier].aiActionsPerMonth) {
      throw new PaymentRequiredException('AI_QUOTA_EXCEEDED');
    }
  }

  async assertUsageCap(nutritionistId: string, feature: 'silhueta' | 'transcription'): Promise<void> {
    const { tier } = await this.resolveAccess(nutritionistId);
    const cfg = PLAN_CATALOG[tier];
    const type = feature === 'silhueta'
      ? AIInteractionType.SILHUETA_SCAN
      : AIInteractionType.CONSULTATION_TRANSCRIPTION;
    const cap = feature === 'silhueta' ? cfg.silhuetaPerMonth : cfg.transcriptionPerMonth;
    const used = await this.countUsage(nutritionistId, [type]);
    if (used >= cap) {
      throw new PaymentRequiredException('AI_QUOTA_EXCEEDED', feature);
    }
  }

  async assertSeatAvailable(nutritionistId: string): Promise<void> {
    const { tier } = await this.resolveAccess(nutritionistId);
    const count = await this.prisma.employeeProfile.count({ where: { nutritionistId } });
    if (count >= PLAN_CATALOG[tier].employeeSeats) {
      throw new PaymentRequiredException('SEAT_LIMIT');
    }
  }

  private async resolveAccess(nutritionistId: string): Promise<DerivedAccess> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    const now = new Date();
    if (!sub) return { tier: 'ESSENCIAL', isReadOnly: true };
    if (sub.isComp) return { tier: 'PRO', isReadOnly: false };
    if (sub.status === 'ACTIVE' && sub.currentPeriodEnd && sub.currentPeriodEnd > now) {
      return { tier: sub.plan ?? 'ESSENCIAL', isReadOnly: false };
    }
    if (sub.status === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt > now) {
      return { tier: 'PRO', isReadOnly: false };
    }
    return { tier: sub.plan ?? 'ESSENCIAL', isReadOnly: true };
  }

  private countUsage(nutritionistId: string, types: AIInteractionType[]): Promise<number> {
    return this.prisma.aIInteraction.count({
      where: {
        nutritionistId,
        success: true,
        type: { in: types },
        createdAt: { gte: saoPauloMonthStart(new Date()) },
      },
    });
  }

  // Jobs de IA ainda em voo contam contra a cota. Sem isto, enfileirar dezenas
  // de gerações passaria pela checagem e só estouraria uma a uma, já que a cota
  // é derivada de AIInteraction bem-sucedidas — não há contador a debitar.
  private countActiveJobs(nutritionistId: string): Promise<number> {
    return this.prisma.aiJob.count({
      where: {
        nutritionistId,
        status: { in: ['PENDING', 'RUNNING'] },
        createdAt: { gte: saoPauloMonthStart(new Date()) },
      },
    });
  }

  private async countAiActions(nutritionistId: string): Promise<number> {
    const [done, active] = await Promise.all([
      this.countUsage(nutritionistId, AI_ACTION_TYPES),
      this.countActiveJobs(nutritionistId),
    ]);
    return done + active;
  }
}
