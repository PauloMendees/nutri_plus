import { ConflictException, ForbiddenException } from '@nestjs/common';
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
