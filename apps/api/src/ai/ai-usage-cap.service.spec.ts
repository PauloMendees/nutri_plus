import { AIInteractionType } from '../generated/prisma/client';
import { AiUsageCapService } from './ai-usage-cap.service';
import { AiDailyCapExceededException } from './ai-daily-cap.exception';
import { AI_DAILY_CAPS } from './ai-usage-cap.policy';
import { saoPauloDayStart } from '../billing/plan-policy';

// Prisma mockado: aIInteraction.count responde por chamada, na ordem
// (nutricionista primeiro, paciente depois).
function makeService(counts: number[]) {
  const count = jest.fn();
  counts.forEach((n) => count.mockResolvedValueOnce(n));
  const prisma = { aIInteraction: { count } } as any;
  return { svc: new AiUsageCapService(prisma), count };
}

describe('AiUsageCapService.assertWithinDailyCaps', () => {
  it('abaixo do teto do nutricionista, passa e conta desde o início do dia em São Paulo', async () => {
    const { svc, count } = makeService([AI_DAILY_CAPS.nutritionist - 1]);
    await expect(
      svc.assertWithinDailyCaps({ nutritionistId: 'n1', type: AIInteractionType.MEAL_PLAN_GENERATION }),
    ).resolves.toBeUndefined();
    const where = count.mock.calls[0][0].where;
    expect(where.nutritionistId).toBe('n1');
    expect(where.type).toBeUndefined(); // todos os tipos
    expect(where.success).toBeUndefined(); // sucesso e falha
    expect(where.createdAt.gte.getTime()).toBe(saoPauloDayStart(new Date()).getTime());
  });

  it('no teto do nutricionista, lança 429 AI_DAILY_CAP_EXCEEDED com scope nutritionist', async () => {
    const { svc } = makeService([AI_DAILY_CAPS.nutritionist]);
    const err = await svc
      .assertWithinDailyCaps({ nutritionistId: 'n1', type: AIInteractionType.MEAL_PLAN_ADJUSTMENT })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AiDailyCapExceededException);
    expect(err.getStatus()).toBe(429);
    expect(err.getResponse()).toMatchObject({ code: 'AI_DAILY_CAP_EXCEEDED', scope: 'nutritionist' });
    expect(err.message).toBe('Limite diário de IA atingido. Tente amanhã.');
  });

  it('paciente no Fora de casa: teto próprio de 10 por dia', async () => {
    const { svc, count } = makeService([0, AI_DAILY_CAPS.patient]);
    const err = await svc
      .assertWithinDailyCaps({ nutritionistId: 'n1', patientId: 'p1', type: AIInteractionType.OUTSIDE_HOME_SUGGESTION })
      .catch((e) => e);
    expect(err.getResponse()).toMatchObject({ scope: 'patient' });
    const where = count.mock.calls[1][0].where;
    expect(where).toMatchObject({ patientId: 'p1', type: AIInteractionType.OUTSIDE_HOME_SUGGESTION });
  });

  it('paciente em outro tipo de chamada não tem teto próprio', async () => {
    const { svc, count } = makeService([0]);
    await svc.assertWithinDailyCaps({ nutritionistId: 'n1', patientId: 'p1', type: AIInteractionType.MEAL_PLAN_GENERATION });
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('sem dono conhecido não consulta o banco', async () => {
    const { svc, count } = makeService([]);
    await svc.assertWithinDailyCaps({ type: AIInteractionType.COLUMN_MAPPING });
    expect(count).not.toHaveBeenCalled();
  });
});
