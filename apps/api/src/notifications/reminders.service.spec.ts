import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { ExpoPushService } from './expo-push.service';
import { RemindersService } from './reminders.service';

describe('RemindersService.dispatch', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let expo: DeepMockProxy<ExpoPushService>;
  let service: RemindersService;
  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    expo = mockDeep<ExpoPushService>();
    service = new RemindersService(prisma, expo);
  });

  it('scans the 24h window for un-reminded appointments with a patient', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    await service.dispatch();
    const arg = prisma.appointment.findMany.mock.calls[0][0] as any;
    expect(arg.where.patientId).toEqual({ not: null });
    expect(arg.where.appointmentReminderSentAt).toBeNull();
    expect(arg.where.startsAt.gt).toBeInstanceOf(Date);
    expect(arg.where.startsAt.lte).toBeInstanceOf(Date);
  });

  it('skips WITHOUT marking when the patient has no token', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { id: 'a1', patientId: 'p1', title: 'Retorno', startsAt: new Date() } as any,
    ]);
    prisma.patientPushToken.findMany.mockResolvedValue([]);
    const out = await service.dispatch();
    expect(expo.send).not.toHaveBeenCalled();
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(out.sent).toBe(0);
  });

  it('sends then marks the appointment reminded when a token exists', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { id: 'a1', patientId: 'p1', title: 'Retorno', startsAt: new Date('2026-07-26T17:00:00Z') } as any,
    ]);
    prisma.patientPushToken.findMany.mockResolvedValue([{ token: 'ExpoTok' }] as any);
    expo.send.mockResolvedValue({ sent: 1, tokensRemoved: 0 });
    const out = await service.dispatch();
    expect(expo.send).toHaveBeenCalledWith([
      expect.objectContaining({ to: 'ExpoTok', title: 'Lembrete de consulta', data: { appointmentId: 'a1' } }),
    ]);
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' }, data: expect.objectContaining({ appointmentReminderSentAt: expect.any(Date) }) }),
    );
    expect(out.sent).toBe(1);
  });

  it('does not mark when nothing was sent (all tokens failed)', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { id: 'a1', patientId: 'p1', title: 'Retorno', startsAt: new Date() } as any,
    ]);
    prisma.patientPushToken.findMany.mockResolvedValue([{ token: 'stale' }] as any);
    expo.send.mockResolvedValue({ sent: 0, tokensRemoved: 1 });
    const out = await service.dispatch();
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(out.tokensRemoved).toBe(1);
  });
});
