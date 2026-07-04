import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIProvider } from '../ai/openai.provider';
import { OutsideHomeService } from './outside-home.service';
import { AuthContext } from '../auth/types/auth-context';
import { AIInteractionType } from '../generated/prisma/client';

const patientCtx = { authProviderId: 's', email: 'p@x.com', name: 'Ana', user: { id: 'u', role: 'PATIENT', patientProfile: { id: 'pp-1' } } } as unknown as AuthContext;

describe('OutsideHomeService.suggest', () => {
  it('builds context, calls the AI, persists, and returns the suggestion', async () => {
    const prisma = mockDeep<PrismaService>();
    const provider = mockDeep<OpenAIProvider>();
    prisma.patientProfile.findUnique.mockResolvedValue({ objective: 'EMAGRECER', restrictions: null, allergies: null, medicalConditions: null, notes: null } as any);
    prisma.mealPlan.findFirst.mockResolvedValue(null as any); // no visible plan
    provider.generateStructured.mockResolvedValue({ suggestion: 'Peça grelhado com salada.' } as any);

    const svc = new OutsideHomeService(prisma, provider);
    const result = await svc.suggest(patientCtx, { message: 'Estou num hamburgueria' });

    expect(provider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'fast', type: AIInteractionType.OUTSIDE_HOME_SUGGESTION, patientId: 'pp-1' }),
    );
    expect(prisma.outsideHomeRequest.create).toHaveBeenCalledWith({
      data: { patientId: 'pp-1', message: 'Estou num hamburgueria', aiSuggestion: 'Peça grelhado com salada.' },
    });
    expect(result).toEqual({ suggestion: 'Peça grelhado com salada.' });
  });
});
