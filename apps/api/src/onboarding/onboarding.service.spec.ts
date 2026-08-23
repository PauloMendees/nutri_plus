import { BadRequestException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingService } from './onboarding.service';

function makePrisma() {
  return mockDeep<PrismaService>();
}

describe('OnboardingService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let svc: OnboardingService;
  beforeEach(() => {
    prisma = makePrisma();
    svc = new OnboardingService(prisma);
  });

  it('GET returns empty tours and null prompt when nothing stored', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
    prisma.onboardingProgress.findMany.mockResolvedValue([]);
    await expect(svc.getMine('u1')).resolves.toEqual({ promptDismissedAt: null, tours: [] });
  });

  it('dismissPrompt sets timestamp only once', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
    prisma.user.update.mockResolvedValue({ onboardingPromptDismissedAt: new Date('2026-08-21') } as any);
    prisma.onboardingProgress.findMany.mockResolvedValue([]);
    const out = await svc.dismissPrompt('u1');
    expect(prisma.user.update).toHaveBeenCalled();
    expect(out.promptDismissedAt).toBeTruthy();

    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: new Date('2026-08-21') } as any);
    prisma.user.update.mockClear();
    await svc.dismissPrompt('u1');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects unknown tourId', async () => {
    await expect(svc.patchTour('u1', 'unknown-tour', { chapterId: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts first chapter write as IN_PROGRESS', async () => {
    prisma.onboardingProgress.findUnique.mockResolvedValue(null);
    prisma.onboardingProgress.upsert.mockResolvedValue({
      id: 'pr1', status: 'IN_PROGRESS', tourId: 'patients', demoPatientId: null, completedAt: null, chapters: [],
    } as any);
    prisma.onboardingChapterProgress.upsert.mockResolvedValue({} as any);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
    prisma.onboardingProgress.findMany.mockResolvedValue([]);
    await svc.patchTour('u1', 'patients', { chapterId: 'lista', chapterStatus: 'IN_PROGRESS', furthestStepId: 'search' });
    expect(prisma.onboardingProgress.upsert).toHaveBeenCalled();
  });

  it('400 when mutating a COMPLETED chapter', async () => {
    prisma.onboardingProgress.findUnique.mockResolvedValue({
      id: 'pr1', status: 'IN_PROGRESS', completedAt: null, demoPatientId: null,
      chapters: [{ id: 'c1', chapterId: 'lista', status: 'COMPLETED', furthestStepId: 'new', completedAt: new Date() }],
    } as any);
    await expect(
      svc.patchTour('u1', 'patients', { chapterId: 'lista', chapterStatus: 'IN_PROGRESS' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('idempotent COMPLETED → COMPLETED is ok', async () => {
    prisma.onboardingProgress.findUnique.mockResolvedValue({
      id: 'pr1', status: 'IN_PROGRESS', completedAt: null, demoPatientId: null,
      chapters: [{ id: 'c1', chapterId: 'lista', status: 'COMPLETED', furthestStepId: 'new', completedAt: new Date() }],
    } as any);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
    prisma.onboardingProgress.findMany.mockResolvedValue([]);
    await expect(
      svc.patchTour('u1', 'patients', { chapterId: 'lista', chapterStatus: 'COMPLETED' }),
    ).resolves.toBeDefined();
  });

  it('does not reopen a COMPLETED tour', async () => {
    prisma.onboardingProgress.findUnique.mockResolvedValue({
      id: 'pr1', status: 'COMPLETED', completedAt: new Date(), demoPatientId: 'p',
      chapters: [],
    } as any);
    await expect(
      svc.patchTour('u1', 'patients', { chapterId: 'lista', chapterStatus: 'IN_PROGRESS' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts the agenda tour and upserts demoAppointmentId on first write', async () => {
    prisma.onboardingProgress.findUnique.mockResolvedValue(null);
    prisma.onboardingProgress.upsert.mockResolvedValue({
      id: 'pr2', status: 'IN_PROGRESS', tourId: 'agenda',
      demoPatientId: null, demoAppointmentId: 'apt-1', demoTransactionId: null,
      completedAt: null, chapters: [],
    } as any);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
    prisma.onboardingProgress.findMany.mockResolvedValue([]);

    await svc.patchTour('u1', 'agenda', { demoAppointmentId: 'apt-1' });

    expect(prisma.onboardingProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_tourId: { userId: 'u1', tourId: 'agenda' } },
        create: expect.objectContaining({ tourId: 'agenda', demoAppointmentId: 'apt-1' }),
      }),
    );
  });

  it('updates demoTransactionId on an existing contabilidade row', async () => {
    prisma.onboardingProgress.findUnique.mockResolvedValue({
      id: 'pr3', status: 'IN_PROGRESS', tourId: 'contabilidade',
      demoPatientId: null, demoAppointmentId: null, demoTransactionId: null,
      completedAt: null, chapters: [],
    } as any);
    prisma.onboardingProgress.update.mockResolvedValue({} as any);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
    prisma.onboardingProgress.findMany.mockResolvedValue([]);

    await svc.patchTour('u1', 'contabilidade', { demoTransactionId: 'tx-1' });

    expect(prisma.onboardingProgress.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pr3' },
        data: expect.objectContaining({ demoTransactionId: 'tx-1' }),
      }),
    );
  });

  it('exposes demoAppointmentId and demoTransactionId in the view', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
    prisma.onboardingProgress.findMany.mockResolvedValue([
      {
        id: 'pr2', tourId: 'agenda', status: 'IN_PROGRESS',
        demoPatientId: null, demoAppointmentId: 'apt-1', demoTransactionId: null,
        completedAt: null, chapters: [],
      },
    ] as any);
    const out = await svc.getMine('u1');
    expect(out.tours[0]).toMatchObject({
      tourId: 'agenda',
      demoAppointmentId: 'apt-1',
      demoTransactionId: null,
    });
  });

  it('still rejects an unknown tourId', async () => {
    await expect(svc.patchTour('u1', 'funcionarios', { chapterId: 'x' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
