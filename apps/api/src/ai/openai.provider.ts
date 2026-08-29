import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { AiInteractionsService } from './ai-interactions.service';
import { AIInteractionType } from '../generated/prisma/client';
import { estimateCostUsd, estimateTranscriptionCostUsd } from './pricing';
import { GenerateStructuredOptions, ModelTier } from './types/ai.types';

// Pior caso de uma chamada: 10 min x 3 tentativas = 30 min. É o número que
// AI_JOB_STUCK_AFTER_MS precisa superar.
export const OPENAI_TIMEOUT_MS = 10 * 60 * 1000;
export const OPENAI_MAX_RETRIES = 2;

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
  private readonly transcribeModel: string;

  constructor(
    config: ConfigService,
    private readonly interactions: AiInteractionsService,
  ) {
    // Explícitos de propósito: AI_JOB_STUCK_AFTER_MS (35 min, em shared-types)
    // é dimensionado sobre o PIOR CASO daqui — timeout x (1 + maxRetries). Se
    // esses números mudarem, aquele limiar precisa mudar junto, senão um job
    // ainda vivo passa a ser apresentado como travado.
    this.client = new OpenAI({
      apiKey: config.getOrThrow<string>('OPENAI_API_KEY'),
      timeout: OPENAI_TIMEOUT_MS,
      maxRetries: OPENAI_MAX_RETRIES,
    });
    this.models = {
      smart: config.getOrThrow<string>('OPENAI_MODEL_SMART'),
      fast: config.getOrThrow<string>('OPENAI_MODEL_FAST'),
    };
    this.transcribeModel = config.getOrThrow<string>('OPENAI_MODEL_TRANSCRIBE');
  }

  async generateStructured<T>(opts: GenerateStructuredOptions<T>): Promise<T> {
    const model = this.models[opts.tier];
    const input = { system: opts.system, user: opts.user };
    const startedAt = Date.now();

    const userContent =
      opts.images && opts.images.length > 0
        ? [
            { type: 'text' as const, text: opts.user },
            ...opts.images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ]
        : opts.user;

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: opts.system },
          {
            role: 'user',
            content: userContent as OpenAI.Chat.Completions.ChatCompletionUserMessageParam['content'],
          },
        ],
        // Cast to `any` required: zodResponseFormat's z3/z4 overload union
        // triggers TS2589 ("instantiation is excessively deep") when the
        // schema parameter carries an unresolved generic T. The cast is purely
        // structural — runtime behaviour is identical.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response_format: zodResponseFormat(opts.schema as any, opts.schemaName),
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
        nutritionistId: opts.nutritionistId,
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
      nutritionistId: opts.nutritionistId,
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

  // Transcreve um áudio de consulta (Whisper). NUNCA registra o texto (PII):
  // o AIInteraction guarda só metadados (modelo, custo por duração, latência).
  async transcribeAudio(
    buffer: Buffer,
    filename: string,
    opts: { patientId?: string; durationSec?: number | null; nutritionistId?: string },
  ): Promise<string> {
    const model = this.transcribeModel;
    const startedAt = Date.now();
    const meta = { system: 'transcription', user: `audio ${opts.durationSec ?? '?'}s` };

    let text: string;
    try {
      const file = await toFile(buffer, filename);
      const result = await this.client.audio.transcriptions.create({ model, file, language: 'pt' });
      text = result.text;
    } catch (err) {
      // O motivo real precisa sobreviver: engolir a exceção aqui já custou um
      // diagnóstico em que "não foi possível transcrever" escondia um
      // "file too large" da OpenAI, e só medir o arquivo por fora revelou.
      const reason = err instanceof Error ? err.message : String(err);
      await this.interactions.record({
        type: AIInteractionType.CONSULTATION_TRANSCRIPTION,
        model,
        input: meta,
        latencyMs: Date.now() - startedAt,
        success: false,
        errorMessage: truncate(reason),
        patientId: opts.patientId,
        nutritionistId: opts.nutritionistId,
      });
      this.logger.warn(`OpenAI transcription failed (model=${model}): ${reason}`);
      throw new BadGatewayException(reason);
    }

    const latencyMs = Date.now() - startedAt;
    await this.interactions.record({
      type: AIInteractionType.CONSULTATION_TRANSCRIPTION,
      model,
      input: meta,
      latencyMs,
      estimatedCostUsd: estimateTranscriptionCostUsd(model, opts.durationSec ?? undefined),
      success: true,
      patientId: opts.patientId,
      nutritionistId: opts.nutritionistId,
    });
    this.logger.log(
      `Transcription ok (model=${model}, durationSec=${opts.durationSec ?? '?'}, latencyMs=${latencyMs})`,
    );
    return text;
  }
}
