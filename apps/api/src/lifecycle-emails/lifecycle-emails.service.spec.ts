import { Logger } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResendService } from '../support/resend.service';
import { LifecycleEmailsService } from './lifecycle-emails.service';

const ENV: Record<string, string> = {
  SUPPORT_FROM_EMAIL: 'oi@inutri.com.br',
  SUPPORT_INBOX_EMAIL: 'suporte@inutri.com.br',
  WEB_ORIGIN: 'https://app.inutri.com.br',
};

function configWith(overrides: Record<string, string | undefined> = {}): ConfigService {
  const env = { ...ENV, ...overrides };
  return {
    get: (key: string) => env[key],
    getOrThrow: (key: string) => {
      const value = env[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

function nutritionistRow(overrides: Partial<{ id: string; name: string | null; email: string; createdAt: Date }> = {}) {
  return {
    id: overrides.id ?? 'nutri-1',
    user: {
      id: 'user-1',
      name: overrides.name ?? 'Elizabeth Fonseca',
      email: overrides.email ?? 'eli@example.com',
      createdAt: overrides.createdAt ?? new Date('2026-09-01T12:00:00Z'),
    },
  };
}

describe('LifecycleEmailsService.dispatch', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let resend: DeepMockProxy<ResendService>;
  let service: LifecycleEmailsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    resend = mockDeep<ResendService>();
    prisma.subscription.findMany.mockResolvedValue([]);
    prisma.lifecycleEmail.create.mockResolvedValue({} as any);
    resend.sendEmail.mockResolvedValue(undefined);
    service = new LifecycleEmailsService(prisma, resend, configWith());
  });

  it('consulta trial com os filtros corretos (status, janela de trialEndsAt, sem paciente real, sem envio anterior)', async () => {
    await service.dispatch();
    const calls = prisma.subscription.findMany.mock.calls as any[];
    const trialCall = calls.find((c) => c[0]?.where?.status === 'TRIALING');
    expect(trialCall).toBeDefined();
    const where = trialCall[0].where;
    expect(where.status).toBe('TRIALING');
    expect(where.isComp).toBe(false);
    expect(where.trialEndsAt.gt).toBeInstanceOf(Date);
    expect(where.trialEndsAt.lte).toBeInstanceOf(Date);
    expect(where.trialEndsAt.gt.getTime()).toBeLessThan(where.trialEndsAt.lte.getTime());
    expect(where.nutritionist.patients).toEqual({ none: { isDemo: false } });
    expect(where.nutritionist.lifecycleEmails).toEqual({ none: { kind: 'TRIAL_NO_PATIENT' } });
  });

  it('consulta cobrança não paga com os filtros corretos (status, onboardedAt, sem pagamento confirmado, sem envio anterior)', async () => {
    await service.dispatch();
    const calls = prisma.subscription.findMany.mock.calls as any[];
    const checkoutCall = calls.find((c) => c[0]?.where?.status === 'PAST_DUE');
    expect(checkoutCall).toBeDefined();
    const where = checkoutCall[0].where;
    expect(where.status).toBe('PAST_DUE');
    expect(where.onboardedAt.lte).toBeInstanceOf(Date);
    expect(where.payments).toEqual({ none: { paidAt: { not: null } } });
    expect(where.nutritionist.lifecycleEmails).toEqual({ none: { kind: 'CHECKOUT_ABANDONED' } });
  });

  it('elegível de trial: envia o e-mail e grava LifecycleEmail com o kind certo', async () => {
    (prisma.subscription.findMany as jest.Mock).mockImplementation(async (args: any) => {
      if (args?.where?.status === 'TRIALING') {
        return [
          {
            id: 'sub-1',
            nutritionistId: 'nutri-1',
            trialEndsAt: new Date('2026-09-20T12:00:00Z'),
            nutritionist: nutritionistRow(),
          } as any,
        ];
      }
      return [];
    });

    const out = await service.dispatch();

    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'eli@example.com',
        from: ENV.SUPPORT_FROM_EMAIL,
        replyTo: ENV.SUPPORT_INBOX_EMAIL,
        subject: 'Seu teste do iNutri está esperando o primeiro paciente',
      }),
    );
    expect(prisma.lifecycleEmail.create).toHaveBeenCalledWith({
      data: { nutritionistId: 'nutri-1', kind: 'TRIAL_NO_PATIENT' },
    });
    expect(out.trialNoPatient).toEqual({ eligible: 1, sent: 1 });
  });

  it('elegível de cobrança não paga: envia o e-mail e grava LifecycleEmail com o kind certo', async () => {
    (prisma.subscription.findMany as jest.Mock).mockImplementation(async (args: any) => {
      if (args?.where?.status === 'PAST_DUE') {
        return [
          {
            id: 'sub-2',
            nutritionistId: 'nutri-2',
            plan: 'PRO',
            billingPeriod: 'MONTHLY',
            trialEndsAt: new Date('2026-09-20T12:00:00Z'),
            nutritionist: nutritionistRow({ id: 'nutri-2', email: 'ana@example.com' }),
          } as any,
        ];
      }
      return [];
    });

    const out = await service.dispatch();

    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@example.com',
        subject: 'Faltou um passo para ativar o seu plano',
      }),
    );
    expect(prisma.lifecycleEmail.create).toHaveBeenCalledWith({
      data: { nutritionistId: 'nutri-2', kind: 'CHECKOUT_ABANDONED' },
    });
    expect(out.checkoutAbandoned).toEqual({ eligible: 1, sent: 1 });
  });

  it('cobrança não paga sem trialEndsAt (checkout sem trial): envia mesmo assim e grava', async () => {
    (prisma.subscription.findMany as jest.Mock).mockImplementation(async (args: any) => {
      if (args?.where?.status === 'PAST_DUE') {
        return [
          {
            id: 'sub-3',
            nutritionistId: 'nutri-3',
            plan: 'PRO',
            billingPeriod: 'MONTHLY',
            trialEndsAt: null,
            nutritionist: nutritionistRow({ id: 'nutri-3', email: 'sem-trial@example.com' }),
          } as any,
        ];
      }
      return [];
    });

    const out = await service.dispatch();

    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'sem-trial@example.com',
        subject: 'Faltou um passo para ativar o seu plano',
        text: expect.stringContaining('este é o único lembrete que enviamos.'),
      }),
    );
    expect(prisma.lifecycleEmail.create).toHaveBeenCalledWith({
      data: { nutritionistId: 'nutri-3', kind: 'CHECKOUT_ABANDONED' },
    });
    expect(out.checkoutAbandoned).toEqual({ eligible: 1, sent: 1 });
  });

  it('falha no envio: não grava e segue para o próximo, sent menor que eligible', async () => {
    (prisma.subscription.findMany as jest.Mock).mockImplementation(async (args: any) => {
      if (args?.where?.status === 'TRIALING') {
        return [
          {
            id: 'sub-1',
            nutritionistId: 'nutri-1',
            trialEndsAt: new Date('2026-09-20T12:00:00Z'),
            nutritionist: nutritionistRow({ id: 'nutri-1', email: 'a@example.com' }),
          } as any,
          {
            id: 'sub-2',
            nutritionistId: 'nutri-2',
            trialEndsAt: new Date('2026-09-20T12:00:00Z'),
            nutritionist: nutritionistRow({ id: 'nutri-2', email: 'b@example.com' }),
          } as any,
        ];
      }
      return [];
    });
    resend.sendEmail.mockRejectedValueOnce(new Error('resend indisponível')).mockResolvedValueOnce(undefined);

    const out = await service.dispatch();

    expect(prisma.lifecycleEmail.create).toHaveBeenCalledTimes(1);
    expect(out.trialNoPatient).toEqual({ eligible: 2, sent: 1 });
  });

  it('grava LifecycleEmail falha com erro genérico: e-mail já enviado ainda conta como sent, segue pro próximo candidato', async () => {
    (prisma.subscription.findMany as jest.Mock).mockImplementation(async (args: any) => {
      if (args?.where?.status === 'TRIALING') {
        return [
          {
            id: 'sub-1',
            nutritionistId: 'nutri-1',
            trialEndsAt: new Date('2026-09-20T12:00:00Z'),
            nutritionist: nutritionistRow({ id: 'nutri-1', email: 'a@example.com' }),
          } as any,
          {
            id: 'sub-2',
            nutritionistId: 'nutri-2',
            trialEndsAt: new Date('2026-09-20T12:00:00Z'),
            nutritionist: nutritionistRow({ id: 'nutri-2', email: 'b@example.com' }),
          } as any,
        ];
      }
      return [];
    });
    prisma.lifecycleEmail.create.mockRejectedValueOnce(new Error('db indisponível')).mockResolvedValueOnce({} as any);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const result = await service.dispatch();

    expect(resend.sendEmail).toHaveBeenCalledTimes(2);
    expect(prisma.lifecycleEmail.create).toHaveBeenCalledTimes(2);
    expect(result.trialNoPatient).toEqual({ eligible: 2, sent: 2 });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nutri-1'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('TRIAL_NO_PATIENT'));
    warnSpy.mockRestore();
  });

  it('grava LifecycleEmail falha com P2002 (corrida com outra execução): conta como sent, sem warn', async () => {
    (prisma.subscription.findMany as jest.Mock).mockImplementation(async (args: any) => {
      if (args?.where?.status === 'TRIALING') {
        return [
          {
            id: 'sub-1',
            nutritionistId: 'nutri-1',
            trialEndsAt: new Date('2026-09-20T12:00:00Z'),
            nutritionist: nutritionistRow({ id: 'nutri-1', email: 'a@example.com' }),
          } as any,
        ];
      }
      return [];
    });
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['nutritionistId', 'kind'] },
    });
    prisma.lifecycleEmail.create.mockRejectedValueOnce(p2002);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const result = await service.dispatch();

    expect(resend.sendEmail).toHaveBeenCalled();
    expect(result.trialNoPatient).toEqual({ eligible: 1, sent: 1 });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('sem SUPPORT_FROM_EMAIL: não consulta nem envia nada e retorna zeros', async () => {
    service = new LifecycleEmailsService(prisma, resend, configWith({ SUPPORT_FROM_EMAIL: undefined }));

    const out = await service.dispatch();

    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    expect(resend.sendEmail).not.toHaveBeenCalled();
    expect(out).toEqual({
      trialNoPatient: { eligible: 0, sent: 0 },
      checkoutAbandoned: { eligible: 0, sent: 0 },
      trialNotStarted: { eligible: 0, sent: 0 },
    });
  });

  it('sem SUPPORT_INBOX_EMAIL: não consulta nem envia nada e retorna zeros', async () => {
    service = new LifecycleEmailsService(prisma, resend, configWith({ SUPPORT_INBOX_EMAIL: undefined }));

    const out = await service.dispatch();

    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    expect(out).toEqual({
      trialNoPatient: { eligible: 0, sent: 0 },
      checkoutAbandoned: { eligible: 0, sent: 0 },
      trialNotStarted: { eligible: 0, sent: 0 },
    });
  });

  describe('dispatchTrialNotStarted', () => {
    it('consulta trial não iniciado com os filtros corretos (trialEndsAt nulo, isComp false, conta criada há >=1 dia, sem envio anterior)', async () => {
      await service.dispatch();
      const calls = prisma.subscription.findMany.mock.calls as any[];
      const call = calls.find((c) => c[0]?.where?.trialEndsAt === null);
      expect(call).toBeDefined();
      const where = call[0].where;
      expect(where.trialEndsAt).toBeNull();
      expect(where.isComp).toBe(false);
      expect(where.nutritionist.user.createdAt.lte).toBeInstanceOf(Date);
      expect(where.nutritionist.lifecycleEmails).toEqual({ none: { kind: 'TRIAL_NOT_STARTED' } });
    });

    it('elegível: envia o e-mail e grava LifecycleEmail com o kind certo', async () => {
      (prisma.subscription.findMany as jest.Mock).mockImplementation(async (args: any) => {
        if (args?.where?.trialEndsAt === null) {
          return [
            {
              id: 'sub-4',
              nutritionistId: 'nutri-4',
              nutritionist: nutritionistRow({ id: 'nutri-4', email: 'nova@example.com' }),
            } as any,
          ];
        }
        return [];
      });

      const out = await service.dispatch();

      expect(resend.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'nova@example.com',
          from: ENV.SUPPORT_FROM_EMAIL,
          replyTo: ENV.SUPPORT_INBOX_EMAIL,
          subject: 'Seu teste do iNutri ainda não começou',
        }),
      );
      expect(prisma.lifecycleEmail.create).toHaveBeenCalledWith({
        data: { nutritionistId: 'nutri-4', kind: 'TRIAL_NOT_STARTED' },
      });
      expect(out.trialNotStarted).toEqual({ eligible: 1, sent: 1 });
    });

    it('falha no envio: não grava e segue para o próximo, sent menor que eligible', async () => {
      (prisma.subscription.findMany as jest.Mock).mockImplementation(async (args: any) => {
        if (args?.where?.trialEndsAt === null) {
          return [
            {
              id: 'sub-4',
              nutritionistId: 'nutri-4',
              nutritionist: nutritionistRow({ id: 'nutri-4', email: 'a@example.com' }),
            } as any,
            {
              id: 'sub-5',
              nutritionistId: 'nutri-5',
              nutritionist: nutritionistRow({ id: 'nutri-5', email: 'b@example.com' }),
            } as any,
          ];
        }
        return [];
      });
      resend.sendEmail.mockRejectedValueOnce(new Error('resend indisponível')).mockResolvedValueOnce(undefined);

      const out = await service.dispatch();

      expect(prisma.lifecycleEmail.create).toHaveBeenCalledTimes(1);
      expect(out.trialNotStarted).toEqual({ eligible: 2, sent: 1 });
    });

    it('sem SUPPORT_FROM_EMAIL: retorna zero também para trial não iniciado', async () => {
      service = new LifecycleEmailsService(prisma, resend, configWith({ SUPPORT_FROM_EMAIL: undefined }));

      const out = await service.dispatch();

      expect(out.trialNotStarted).toEqual({ eligible: 0, sent: 0 });
    });
  });
});
