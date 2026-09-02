import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { MetaActivationService } from './meta-activation.service';
import { MetaCapiService } from './meta-capi.service';
import { MetaSignalsService, planValue } from './meta-signals.service';
import type { MetaContext } from './meta-context';

const CTX: MetaContext = { eventId: 'evt-1', fromBrowser: true };

describe('planValue', () => {
  it('lê o preço vigente do PLAN_CATALOG', () => {
    expect(planValue('ESSENCIAL', 'MONTHLY')).toBe(39);
    expect(planValue('PRO', 'MONTHLY')).toBe(79);
    expect(planValue('PRO', 'YEARLY')).toBe(790);
    expect(planValue(null, 'MONTHLY')).toBeNull();
  });
});

describe('MetaSignalsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let capi: DeepMockProxy<MetaCapiService>;
  let activation: DeepMockProxy<MetaActivationService>;
  let service: MetaSignalsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    capi = mockDeep<MetaCapiService>();
    activation = mockDeep<MetaActivationService>();
    service = new MetaSignalsService(prisma, capi, activation);
  });

  it('CompleteRegistration usa o e-mail do corpo (não há sessão ainda)', () => {
    expect(service.registration('ana@clinica.com', CTX)).toBe(true);
    expect(capi.enqueue).toHaveBeenCalledWith({
      name: 'CompleteRegistration',
      context: CTX,
      email: 'ana@clinica.com',
      customData: { status: true },
    });
  });

  it('Subscribe usa o valor REAL da assinatura no banco, não o que o cliente mandou', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: 'PRO',
      billingPeriod: 'YEARLY',
    } as never);

    await service.authenticated(
      {
        nutritionistId: 'n1',
        email: 'ana@clinica.com',
        // Cliente alegando Essencial mensal (R$39): o servidor ignora e usa Pro anual.
        dto: { name: 'Subscribe', plan: 'ESSENCIAL', period: 'MONTHLY' },
      },
      CTX,
    );

    expect(capi.enqueue).toHaveBeenCalledWith({
      name: 'Subscribe',
      context: CTX,
      email: 'ana@clinica.com',
      customData: { currency: 'BRL', value: 790, content_name: 'PRO' },
    });
  });

  it('Subscribe cai para o plano informado quando a assinatura ainda não gravou', async () => {
    prisma.subscription.findUnique.mockResolvedValue(null as never);
    await service.authenticated(
      { nutritionistId: 'n1', email: 'a@b.c', dto: { name: 'Subscribe', plan: 'PRO', period: 'MONTHLY' } },
      CTX,
    );
    expect(capi.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ customData: { currency: 'BRL', value: 79, content_name: 'PRO' } }),
    );
  });

  it('InitiateCheckout deriva o valor do plano escolhido', async () => {
    await service.authenticated(
      { nutritionistId: 'n1', email: 'a@b.c', dto: { name: 'InitiateCheckout', plan: 'ESSENCIAL', period: 'YEARLY' } },
      CTX,
    );
    expect(capi.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'InitiateCheckout',
        customData: { currency: 'BRL', value: 390, content_name: 'ESSENCIAL' },
      }),
    );
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('StartTrial vai sem valor de propósito — a campanha otimiza pelo evento', async () => {
    await service.authenticated(
      { nutritionistId: 'n1', email: 'a@b.c', dto: { name: 'StartTrial' } },
      CTX,
    );
    expect(capi.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'StartTrial', customData: { currency: 'BRL', value: 0 } }),
    );
  });

  it('TrialAtivado delega a decisão ao serviço de ativação e devolve o veredito', async () => {
    activation.evaluate.mockResolvedValue(true);
    await expect(
      service.authenticated({ nutritionistId: 'n1', email: 'a@b.c', dto: { name: 'TrialAtivado' } }, CTX),
    ).resolves.toBe(true);
    expect(activation.evaluate).toHaveBeenCalledWith('n1', CTX);
    // Não passa pela CAPI direto: quem enfileira é o serviço de ativação, depois da flag.
    expect(capi.enqueue).not.toHaveBeenCalled();
  });

  it('TrialAtivado devolve false quando a condição ainda não fechou', async () => {
    activation.evaluate.mockResolvedValue(false);
    await expect(
      service.authenticated({ nutritionistId: 'n1', email: 'a@b.c', dto: { name: 'TrialAtivado' } }, CTX),
    ).resolves.toBe(false);
  });
});
