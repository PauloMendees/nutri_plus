import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { AiInteractionsService } from './ai-interactions.service';
import { AIInteractionType } from '../generated/prisma/client';

describe('AiInteractionsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: AiInteractionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new AiInteractionsService(prisma);
  });

  it('persists a successful interaction with the full audit shape', async () => {
    prisma.aIInteraction.create.mockResolvedValue({ id: 'i1' } as any);

    await service.record({
      type: AIInteractionType.MEAL_PLAN_GENERATION,
      model: 'gpt-4o',
      input: { system: 'sys', user: 'usr' },
      response: { title: 'Plan' },
      promptTokens: 100,
      completionTokens: 50,
      latencyMs: 1200,
      estimatedCostUsd: 0.00075,
      success: true,
      patientId: 'p1',
    });

    expect(prisma.aIInteraction.create).toHaveBeenCalledWith({
      data: {
        type: AIInteractionType.MEAL_PLAN_GENERATION,
        model: 'gpt-4o',
        input: { system: 'sys', user: 'usr' },
        response: { title: 'Plan' },
        promptTokens: 100,
        completionTokens: 50,
        latencyMs: 1200,
        estimatedCostUsd: 0.00075,
        success: true,
        errorMessage: undefined,
        patientId: 'p1',
      },
    });
  });

  it('persists a failed interaction with a null response', async () => {
    prisma.aIInteraction.create.mockResolvedValue({ id: 'i2' } as any);

    await service.record({
      type: AIInteractionType.MEAL_PLAN_GENERATION,
      model: 'gpt-4o',
      input: { system: 'sys', user: 'usr' },
      success: false,
      errorMessage: 'boom',
    });

    expect(prisma.aIInteraction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        success: false,
        errorMessage: 'boom',
        response: undefined,
      }),
    });
  });

  it('never throws when the audit write fails (logs instead)', async () => {
    prisma.aIInteraction.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.record({
        type: AIInteractionType.MEAL_PLAN_GENERATION,
        model: 'gpt-4o',
        input: { system: 'sys', user: 'usr' },
        success: true,
      }),
    ).resolves.toBeUndefined();
  });
});
