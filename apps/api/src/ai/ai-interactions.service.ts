import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIInteractionType, Prisma } from '../generated/prisma/client';

export interface RecordInteractionInput {
  type: AIInteractionType;
  model: string;
  input: { system: string; user: string };
  response?: unknown;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  estimatedCostUsd?: number | null;
  success: boolean;
  errorMessage?: string;
  patientId?: string;
}

@Injectable()
export class AiInteractionsService {
  private readonly logger = new Logger(AiInteractionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Never throws: an audit failure must not mask the AI result it documents
  // (same contract as SupabaseAdminService.deleteUser).
  async record(data: RecordInteractionInput): Promise<void> {
    try {
      await this.prisma.aIInteraction.create({
        data: {
          type: data.type,
          model: data.model,
          input: data.input as unknown as Prisma.InputJsonValue,
          response:
            data.response === undefined
              ? undefined
              : (data.response as Prisma.InputJsonValue),
          promptTokens: data.promptTokens,
          completionTokens: data.completionTokens,
          latencyMs: data.latencyMs,
          estimatedCostUsd: data.estimatedCostUsd,
          success: data.success,
          errorMessage: data.errorMessage,
          patientId: data.patientId,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist AIInteraction (type=${data.type})`,
        error as Error,
      );
    }
  }
}
