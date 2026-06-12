import { BadGatewayException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { z } from 'zod';
import { OpenAIProvider } from './openai.provider';
import { AiInteractionsService } from './ai-interactions.service';
import { AIInteractionType } from '../generated/prisma/client';

const ENV: Record<string, string> = {
  OPENAI_API_KEY: 'sk-test',
  OPENAI_MODEL_SMART: 'gpt-4o',
  OPENAI_MODEL_FAST: 'gpt-4o-mini',
};

const schema = z.object({ title: z.string() });

function makeProvider(env: Record<string, string> = ENV) {
  const config = {
    getOrThrow: (key: string) => {
      if (env[key] === undefined) throw new Error(`missing ${key}`);
      return env[key];
    },
  } as any;
  const interactions = mockDeep<AiInteractionsService>();
  const provider = new OpenAIProvider(config, interactions);
  const create = jest.fn();
  (provider as any).client = { chat: { completions: { create } } };
  return { provider, interactions, create };
}

function completion(content: string | null, refusal: string | null = null) {
  return {
    choices: [{ message: { content, refusal } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

const baseOpts = {
  tier: 'smart' as const,
  system: 'You are a nutrition assistant.',
  user: '{"objective":"WEIGHT_LOSS"}',
  schema,
  schemaName: 'test_schema',
  type: AIInteractionType.MEAL_PLAN_GENERATION,
  patientId: 'p1',
};

describe('OpenAIProvider.generateStructured', () => {
  it('returns the parsed object and records a successful interaction', async () => {
    const { provider, interactions, create } = makeProvider();
    create.mockResolvedValue(completion(JSON.stringify({ title: 'Plan' })));

    const result = await provider.generateStructured(baseOpts);

    expect(result).toEqual({ title: 'Plan' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: baseOpts.system },
          { role: 'user', content: baseOpts.user },
        ],
        response_format: expect.anything(),
      }),
    );
    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AIInteractionType.MEAL_PLAN_GENERATION,
        model: 'gpt-4o',
        input: { system: baseOpts.system, user: baseOpts.user },
        response: { title: 'Plan' },
        promptTokens: 100,
        completionTokens: 50,
        // gpt-4o: (100 * 2.5 + 50 * 10) / 1e6
        estimatedCostUsd: expect.closeTo(0.00075, 10),
        success: true,
        patientId: 'p1',
      }),
    );
  });

  it('resolves the fast tier to the configured fast model', async () => {
    const { provider, create } = makeProvider();
    create.mockResolvedValue(completion(JSON.stringify({ title: 'x' })));

    await provider.generateStructured({ ...baseOpts, tier: 'fast' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o-mini' }),
    );
  });

  it('records a null cost for an unknown model', async () => {
    const { provider, interactions, create } = makeProvider({
      ...ENV,
      OPENAI_MODEL_SMART: 'gpt-future',
    });
    create.mockResolvedValue(completion(JSON.stringify({ title: 'x' })));

    await provider.generateStructured(baseOpts);

    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-future', estimatedCostUsd: null }),
    );
  });

  it('maps an SDK failure to BadGateway and records the failed call', async () => {
    const { provider, interactions, create } = makeProvider();
    create.mockRejectedValue(new Error('network'));

    await expect(provider.generateStructured(baseOpts)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: 'OpenAI request failed',
      }),
    );
  });

  it('maps unparsable JSON content to BadGateway and records the payload', async () => {
    const { provider, interactions, create } = makeProvider();
    create.mockResolvedValue(completion('not-json'));

    await expect(provider.generateStructured(baseOpts)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: expect.stringContaining('Unparsable JSON'),
      }),
    );
  });

  it('maps a schema-invalid response to BadGateway and records the payload', async () => {
    const { provider, interactions, create } = makeProvider();
    create.mockResolvedValue(completion(JSON.stringify({ wrong: 1 })));

    await expect(provider.generateStructured(baseOpts)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: expect.stringContaining('Schema validation failed'),
      }),
    );
  });

  it('maps a refusal to BadGateway and records it', async () => {
    const { provider, interactions, create } = makeProvider();
    create.mockResolvedValue(completion(null, 'I cannot help with that'));

    await expect(provider.generateStructured(baseOpts)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: expect.stringContaining('Refusal'),
      }),
    );
  });
});
