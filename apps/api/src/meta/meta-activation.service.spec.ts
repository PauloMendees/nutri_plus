import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { MetaActivationService } from './meta-activation.service';
import { MetaCapiService } from './meta-capi.service';
import { serverOnlyMetaContext, type MetaContext } from './meta-context';

const CTX: MetaContext = {
  eventId: 'evt-activation',
  eventSourceUrl: 'https://inutri.life/patients',
  fromBrowser: true,
};

describe('MetaActivationService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let capi: DeepMockProxy<MetaCapiService>;
  let service: MetaActivationService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    capi = mockDeep<MetaCapiService>();
    service = new MetaActivationService(prisma, capi);
  });

  function withCounts(patients: number, mealPlans: number) {
    prisma.patientProfile.count.mockResolvedValue(patients as never);
    prisma.mealPlan.count.mockResolvedValue(mealPlans as never);
  }

  function pending() {
    prisma.subscription.findUnique.mockResolvedValue({ id: 's1', trialAtivadoEm: null } as never);
  }

  it('emite quando há paciente E plano, com o event id do navegador', async () => {
    pending();
    withCounts(1, 1);
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.nutritionistProfile.findUnique.mockResolvedValue({
      user: { email: 'ana@clinica.com' },
    } as never);

    await expect(service.evaluate('nutri-1', CTX)).resolves.toBe(true);
    expect(capi.enqueue).toHaveBeenCalledWith({
      name: 'TrialAtivado',
      context: CTX,
      email: 'ana@clinica.com',
    });
  });

  it('não emite com paciente mas sem plano', async () => {
    pending();
    withCounts(3, 0);
    await expect(service.evaluate('nutri-1', CTX)).resolves.toBe(false);
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    expect(capi.enqueue).not.toHaveBeenCalled();
  });

  it('não emite com plano mas sem paciente', async () => {
    pending();
    withCounts(0, 2);
    await expect(service.evaluate('nutri-1', CTX)).resolves.toBe(false);
    expect(capi.enqueue).not.toHaveBeenCalled();
  });

  it('ignora paciente e plano de demonstração do tour', async () => {
    pending();
    withCounts(0, 0);
    await service.evaluate('nutri-1', CTX);
    expect(prisma.patientProfile.count).toHaveBeenCalledWith({
      where: { nutritionistId: 'nutri-1', onboardingDemoFor: { none: {} } },
    });
    expect(prisma.mealPlan.count).toHaveBeenCalledWith({
      where: { patient: { nutritionistId: 'nutri-1', onboardingDemoFor: { none: {} } } },
    });
  });

  it('não reemite quando a flag já está gravada', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      id: 's1',
      trialAtivadoEm: new Date('2026-08-01'),
    } as never);
    await expect(service.evaluate('nutri-1', CTX)).resolves.toBe(false);
    expect(prisma.patientProfile.count).not.toHaveBeenCalled();
    expect(capi.enqueue).not.toHaveBeenCalled();
  });

  it('perde a corrida em silêncio quando outra requisição reivindicou a flag', async () => {
    pending();
    withCounts(1, 1);
    // updateMany condicional (trialAtivadoEm: null) devolve 0 para o perdedor.
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(service.evaluate('nutri-1', CTX)).resolves.toBe(false);
    expect(capi.enqueue).not.toHaveBeenCalled();
  });

  it('reivindica a flag com o cadeado trialAtivadoEm: null', async () => {
    pending();
    withCounts(1, 1);
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ user: { email: 'a@b.c' } } as never);
    await service.evaluate('nutri-1', CTX);
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', trialAtivadoEm: null },
      data: { trialAtivadoEm: expect.any(Date) },
    });
  });

  it('não emite para quem não tem assinatura', async () => {
    prisma.subscription.findUnique.mockResolvedValue(null as never);
    await expect(service.evaluate('nutri-1', CTX)).resolves.toBe(false);
  });

  it('engole erro do banco: telemetria não derruba o fluxo do usuário', async () => {
    prisma.subscription.findUnique.mockRejectedValue(new Error('conexão perdida'));
    await expect(service.evaluate('nutri-1', CTX)).resolves.toBe(false);
  });

  it('funciona sem navegador (job de IA): gera o próprio event id', async () => {
    pending();
    withCounts(1, 1);
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ user: { email: 'a@b.c' } } as never);

    const serverCtx = serverOnlyMetaContext();
    expect(serverCtx.fromBrowser).toBe(false);
    await service.evaluate('nutri-1', serverCtx);
    expect(capi.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ eventId: serverCtx.eventId }) }),
    );
  });
});
