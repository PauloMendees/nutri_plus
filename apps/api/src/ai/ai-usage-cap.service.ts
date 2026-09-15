import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIInteractionType } from '../generated/prisma/client';
import { saoPauloDayStart } from '../billing/plan-policy';
import { AI_DAILY_CAPS } from './ai-usage-cap.policy';
import { AiDailyCapExceededException } from './ai-daily-cap.exception';

export interface AiCallOwner {
  nutritionistId?: string;
  patientId?: string;
  type: AIInteractionType;
}

// Consultado pelo OpenAIProvider antes de QUALQUER chamada. Conta linhas de
// AIInteraction (sucesso e falha) do dia corrente em São Paulo, então repetir
// uma chamada quebrada não é grátis. Não há contador a debitar: a própria
// auditoria é a fonte.
@Injectable()
export class AiUsageCapService {
  private readonly logger = new Logger(AiUsageCapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assertWithinDailyCaps(owner: AiCallOwner): Promise<void> {
    if (!owner.nutritionistId && !owner.patientId) {
      this.logger.warn(`AI call without owner (type=${owner.type}); daily cap not applied`);
      return;
    }
    const since = saoPauloDayStart(new Date());

    if (owner.nutritionistId) {
      // Exclui OUTSIDE_HOME_SUGGESTION: essas chamadas do paciente carregam o
      // nutritionistId da ficha, e um nutricionista com muitos pacientes
      // trancaria a própria conta com o uso legítimo deles (20 pacientes × 3
      // chamadas já estoura os 60). O tipo já tem teto próprio por paciente.
      const used = await this.prisma.aIInteraction.count({
        where: {
          nutritionistId: owner.nutritionistId,
          type: { not: AIInteractionType.OUTSIDE_HOME_SUGGESTION },
          createdAt: { gte: since },
        },
      });
      if (used >= AI_DAILY_CAPS.nutritionist) throw new AiDailyCapExceededException('nutritionist');
    }

    if (owner.patientId && owner.type === AIInteractionType.OUTSIDE_HOME_SUGGESTION) {
      const used = await this.prisma.aIInteraction.count({
        where: {
          patientId: owner.patientId,
          type: AIInteractionType.OUTSIDE_HOME_SUGGESTION,
          createdAt: { gte: since },
        },
      });
      if (used >= AI_DAILY_CAPS.patient) throw new AiDailyCapExceededException('patient');
    }
  }
}
