import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIProvider } from '../ai/openai.provider';
import { AuthContext } from '../auth/types/auth-context';
import { AIInteractionType } from '../generated/prisma/client';
import { resolveScopePatientId } from '../auth/auth-scope';
import { CreateOutsideHomeDto } from './dto/create-outside-home.dto';
import {
  OUTSIDE_HOME_SYSTEM_PROMPT,
  buildOutsideHomeUserPrompt,
} from '../ai/prompts/outside-home.prompt';

const suggestionSchema = z.object({ suggestion: z.string() });

@Injectable()
export class OutsideHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: OpenAIProvider,
  ) {}

  async suggest(ctx: AuthContext, dto: CreateOutsideHomeDto) {
    const patientId = resolveScopePatientId(ctx);

    const profile = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: {
        objective: true,
        restrictions: true,
        allergies: true,
        medicalConditions: true,
        notes: true,
      },
    });

    const plan = await this.prisma.mealPlan.findFirst({
      where: { patientId, visibleToPatient: true },
      orderBy: { createdAt: 'desc' },
      select: { title: true, objective: true },
    });

    const { suggestion } = await this.provider.generateStructured({
      tier: 'fast',
      system: OUTSIDE_HOME_SYSTEM_PROMPT,
      user: buildOutsideHomeUserPrompt({
        objective: profile?.objective ?? null,
        restrictions: profile?.restrictions ?? null,
        allergies: profile?.allergies ?? null,
        medicalConditions: profile?.medicalConditions ?? null,
        patientNotes: profile?.notes ?? null,
        currentPlanSummary: plan ? `${plan.title ?? 'Plano'} — ${plan.objective ?? ''}`.trim() : null,
        message: dto.message,
      }),
      schema: suggestionSchema,
      schemaName: 'outside_home_suggestion',
      type: AIInteractionType.OUTSIDE_HOME_SUGGESTION,
      patientId,
    });

    await this.prisma.outsideHomeRequest.create({
      data: { patientId, message: dto.message, aiSuggestion: suggestion },
    });

    return { suggestion };
  }
}
