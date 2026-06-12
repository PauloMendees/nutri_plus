import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { AiInteractionsService } from './ai-interactions.service';
import { estimateCostUsd } from './pricing';
import { GenerateStructuredOptions, ModelTier } from './types/ai.types';

// Keep stored error payloads bounded; full content is never logged (PII).
function truncate(s: string, max = 500): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// The single gateway to OpenAI. Nothing else in the codebase may import the
// SDK: controllers and feature services call generateStructured. The provider
// is mechanism-only — it knows nothing about macros/BMI/TDEE; all critical
// calculations happen in backend services before the prompt is built.
@Injectable()
export class OpenAIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly client: OpenAI;
  private readonly models: Record<ModelTier, string>;

  constructor(
    config: ConfigService,
    private readonly interactions: AiInteractionsService,
  ) {
    this.client = new OpenAI({
      apiKey: config.getOrThrow<string>('OPENAI_API_KEY'),
    });
    this.models = {
      smart: config.getOrThrow<string>('OPENAI_MODEL_SMART'),
      fast: config.getOrThrow<string>('OPENAI_MODEL_FAST'),
    };
  }

  async generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<T> {
    const model = this.models[opts.tier];
    const input = { system: opts.system, user: opts.user };
    const startedAt = Date.now();

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        response_format: zodResponseFormat(opts.schema as never, opts.schemaName),
      });
    } catch {
      await this.interactions.record({
        type: opts.type,
        model,
        input,
        latencyMs: Date.now() - startedAt,
        success: false,
        errorMessage: 'OpenAI request failed',
        patientId: opts.patientId,
      });
      this.logger.warn(`OpenAI request failed (type=${opts.type}, model=${model})`);
      throw new BadGatewayException('AI provider unavailable');
    }

    const latencyMs = Date.now() - startedAt;
    const promptTokens = completion.usage?.prompt_tokens;
    const completionTokens = completion.usage?.completion_tokens;
    const common = {
      type: opts.type,
      model,
      input,
      promptTokens,
      completionTokens,
      latencyMs,
      estimatedCostUsd: estimateCostUsd(model, promptTokens, completionTokens),
      patientId: opts.patientId,
    };

    const reject = async (errorMessage: string): Promise<never> => {
      await this.interactions.record({ ...common, success: false, errorMessage });
      this.logger.warn(`AI response invalid (type=${opts.type}, model=${model})`);
      throw new BadGatewayException('AI returned an invalid response');
    };

    const message = completion.choices[0]?.message;
    if (!message?.content || message.refusal) {
      return reject(
        message?.refusal
          ? `Refusal: ${truncate(message.refusal)}`
          : 'Empty response content',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message.content);
    } catch {
      return reject(`Unparsable JSON: ${truncate(message.content)}`);
    }

    const result = opts.schema.safeParse(parsed);
    if (!result.success) {
      return reject(
        `Schema validation failed: ${truncate(result.error.message)}; payload: ${truncate(message.content)}`,
      );
    }

    await this.interactions.record({ ...common, success: true, response: parsed });
    // Usage metadata only — never prompt or response content (patient data).
    this.logger.log(
      `AI ok (type=${opts.type}, model=${model}, promptTokens=${promptTokens ?? '?'}, completionTokens=${completionTokens ?? '?'}, latencyMs=${latencyMs}, costUsd=${common.estimatedCostUsd ?? '?'})`,
    );
    return result.data;
  }
}
