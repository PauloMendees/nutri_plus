import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import {
  FEEDBACK_SNOOZE_MS,
  NUTRITIONIST_PROMPT_DELAY_MS,
  PATIENT_PROMPT_DELAY_MS,
} from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { UserRole } from '../generated/prisma/client';
import { FeedbackService } from './feedback.service';

const NOW = new Date('2026-08-14T12:00:00.000Z');

function ctx(partial: {
  role: UserRole;
  createdAt?: Date;
  patientProfile?: { id: string; firstAppLoginAt: Date | null } | null;
}): AuthContext {
  return {
    authProviderId: 'sub',
    email: 'a@x.com',
    name: 'Ana',
    user: {
      id: 'u1',
      authProvider: 'supabase',
      authProviderId: 'sub',
      email: 'a@x.com',
      name: 'Ana',
      role: partial.role,
      createdAt: partial.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: NOW,
      nutritionistProfile: partial.role === UserRole.NUTRITIONIST ? { id: 'n1' } : null,
      patientProfile: partial.role === UserRole.PATIENT ? (partial.patientProfile ?? { id: 'p1', firstAppLoginAt: null }) : null,
      employeeProfile: partial.role === UserRole.EMPLOYEE ? { id: 'e1' } : null,
    },
  } as unknown as AuthContext;
}

describe('FeedbackService.getPrompt', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let svc: FeedbackService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prisma = mockDeep<PrismaService>();
    prisma.userFeedback.findUnique.mockResolvedValue(null);
    svc = new FeedbackService(prisma, { get: () => undefined } as any, { sendSupportEmail: jest.fn() } as any);
  });

  afterEach(() => jest.useRealTimers());

  it('funcionário sempre shouldShow=false e não stamp firstAppLoginAt', async () => {
    const out = await svc.getPrompt(ctx({ role: UserRole.EMPLOYEE }));
    expect(out).toEqual({ shouldShow: false, source: 'WEB' });
    expect(prisma.patientProfile.update).not.toHaveBeenCalled();
  });

  it('nutricionista com conta < 72h → false', async () => {
    const createdAt = new Date(NOW.getTime() - NUTRITIONIST_PROMPT_DELAY_MS + 1_000);
    const out = await svc.getPrompt(ctx({ role: UserRole.NUTRITIONIST, createdAt }));
    expect(out).toEqual({ shouldShow: false, source: 'WEB' });
  });

  it('nutricionista com conta ≥ 72h sem linha → true', async () => {
    const createdAt = new Date(NOW.getTime() - NUTRITIONIST_PROMPT_DELAY_MS);
    const out = await svc.getPrompt(ctx({ role: UserRole.NUTRITIONIST, createdAt }));
    expect(out).toEqual({ shouldShow: true, source: 'WEB' });
  });

  it('paciente no primeiro GET stamp firstAppLoginAt e retorna false', async () => {
    prisma.patientProfile.update.mockResolvedValue({} as any);
    const out = await svc.getPrompt(
      ctx({ role: UserRole.PATIENT, patientProfile: { id: 'p1', firstAppLoginAt: null } }),
    );
    expect(out).toEqual({ shouldShow: false, source: 'MOBILE' });
    expect(prisma.patientProfile.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { firstAppLoginAt: NOW },
    });
  });

  it('paciente com firstAppLoginAt < 168h → false sem novo stamp', async () => {
    const first = new Date(NOW.getTime() - PATIENT_PROMPT_DELAY_MS + 1_000);
    const out = await svc.getPrompt(
      ctx({ role: UserRole.PATIENT, patientProfile: { id: 'p1', firstAppLoginAt: first } }),
    );
    expect(out).toEqual({ shouldShow: false, source: 'MOBILE' });
    expect(prisma.patientProfile.update).not.toHaveBeenCalled();
  });

  it('paciente com firstAppLoginAt ≥ 168h → true', async () => {
    const first = new Date(NOW.getTime() - PATIENT_PROMPT_DELAY_MS);
    const out = await svc.getPrompt(
      ctx({ role: UserRole.PATIENT, patientProfile: { id: 'p1', firstAppLoginAt: first } }),
    );
    expect(out).toEqual({ shouldShow: true, source: 'MOBILE' });
  });

  it('resolvedAt preenchido → false', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue({ resolvedAt: NOW } as any);
    const out = await svc.getPrompt(ctx({ role: UserRole.NUTRITIONIST }));
    expect(out.shouldShow).toBe(false);
  });

  it('snoozedUntil no futuro → false; depois do snooze → true', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue({
      resolvedAt: null,
      snoozedUntil: new Date(NOW.getTime() + 1_000),
      dismissCount: 1,
    } as any);
    const during = await svc.getPrompt(ctx({ role: UserRole.NUTRITIONIST }));
    expect(during.shouldShow).toBe(false);

    prisma.userFeedback.findUnique.mockResolvedValue({
      resolvedAt: null,
      snoozedUntil: new Date(NOW.getTime() - 1_000),
      dismissCount: 1,
    } as any);
    const after = await svc.getPrompt(ctx({ role: UserRole.NUTRITIONIST }));
    expect(after.shouldShow).toBe(true);
  });
});

describe('FeedbackService.dismiss', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let svc: FeedbackService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prisma = mockDeep<PrismaService>();
    svc = new FeedbackService(prisma, { get: () => undefined } as any, { sendSupportEmail: jest.fn() } as any);
  });
  afterEach(() => jest.useRealTimers());

  it('funcionário → 403', async () => {
    await expect(svc.dismiss(ctx({ role: UserRole.EMPLOYEE }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('primeiro dismiss cria snooze de 168h', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue(null);
    prisma.userFeedback.upsert.mockResolvedValue({} as any);
    const out = await svc.dismiss(ctx({ role: UserRole.NUTRITIONIST }));
    expect(out).toEqual({ ok: true });
    expect(prisma.userFeedback.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: {
        userId: 'u1',
        dismissCount: 1,
        snoozedUntil: new Date(NOW.getTime() + FEEDBACK_SNOOZE_MS),
      },
      update: {
        dismissCount: 1,
        snoozedUntil: new Date(NOW.getTime() + FEEDBACK_SNOOZE_MS),
      },
    });
  });

  it('segundo dismiss preenche resolvedAt', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue({
      id: 'f1',
      dismissCount: 1,
      resolvedAt: null,
    } as any);
    prisma.userFeedback.update.mockResolvedValue({} as any);
    await svc.dismiss(ctx({ role: UserRole.PATIENT }));
    expect(prisma.userFeedback.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { dismissCount: 2, resolvedAt: NOW },
    });
  });

  it('já resolvido → 409', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue({ resolvedAt: NOW, dismissCount: 2 } as any);
    await expect(svc.dismiss(ctx({ role: UserRole.NUTRITIONIST }))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('FeedbackService.submit', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let resend: { sendSupportEmail: jest.Mock };
  let svc: FeedbackService;
  const env = {
    SUPPORT_INBOX_EMAIL: 'inbox@inutri.life',
    SUPPORT_FROM_EMAIL: 'iNutri Suporte <suporte@inutri.life>',
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prisma = mockDeep<PrismaService>();
    resend = { sendSupportEmail: jest.fn().mockResolvedValue(undefined) };
    svc = new FeedbackService(prisma, { get: (k: string) => env[k as keyof typeof env] } as any, resend as any);
    prisma.userFeedback.findUnique.mockResolvedValue(null);
    prisma.userFeedback.upsert.mockResolvedValue({} as any);
  });
  afterEach(() => jest.useRealTimers());

  it('envia e-mail e depois persiste rating + resolvedAt', async () => {
    const out = await svc.submit(ctx({ role: UserRole.NUTRITIONIST }), {
      rating: 5,
      comment: '  top  ',
    });
    expect(out).toEqual({ ok: true });
    expect(resend.sendSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'inbox@inutri.life',
        from: 'iNutri Suporte <suporte@inutri.life>',
        replyTo: 'a@x.com',
        subject: '[iNutri Feedback] 5/5 — Ana',
      }),
    );
    expect(prisma.userFeedback.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: {
        userId: 'u1',
        rating: 5,
        comment: 'top',
        source: 'WEB',
        resolvedAt: NOW,
      },
      update: {
        rating: 5,
        comment: 'top',
        source: 'WEB',
        resolvedAt: NOW,
      },
    });
    const emailOrder = resend.sendSupportEmail.mock.invocationCallOrder[0];
    const dbOrder = prisma.userFeedback.upsert.mock.invocationCallOrder[0];
    expect(emailOrder).toBeLessThan(dbOrder);
  });

  it('comment vazio vira null; paciente source=MOBILE', async () => {
    await svc.submit(ctx({ role: UserRole.PATIENT }), { rating: 2, comment: '   ' });
    expect(prisma.userFeedback.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ comment: null, source: 'MOBILE', rating: 2 }),
      }),
    );
  });

  it('já resolvido → 409 e não manda e-mail', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue({ resolvedAt: NOW } as any);
    await expect(
      svc.submit(ctx({ role: UserRole.NUTRITIONIST }), { rating: 4 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(resend.sendSupportEmail).not.toHaveBeenCalled();
    expect(prisma.userFeedback.upsert).not.toHaveBeenCalled();
  });

  it('env ausente → 503 e não persiste', async () => {
    svc = new FeedbackService(prisma, { get: () => undefined } as any, resend as any);
    await expect(
      svc.submit(ctx({ role: UserRole.NUTRITIONIST }), { rating: 4 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.userFeedback.upsert).not.toHaveBeenCalled();
  });

  it('Resend falha → propaga e não persiste (dismiss anterior intacto)', async () => {
    prisma.userFeedback.findUnique.mockResolvedValue({
      id: 'f1',
      dismissCount: 1,
      resolvedAt: null,
    } as any);
    resend.sendSupportEmail.mockRejectedValue(new Error('resend down'));
    await expect(
      svc.submit(ctx({ role: UserRole.NUTRITIONIST }), { rating: 3 }),
    ).rejects.toThrow('resend down');
    expect(prisma.userFeedback.upsert).not.toHaveBeenCalled();
    expect(prisma.userFeedback.update).not.toHaveBeenCalled();
  });

  it('funcionário → 403', async () => {
    await expect(
      svc.submit(ctx({ role: UserRole.EMPLOYEE }), { rating: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
