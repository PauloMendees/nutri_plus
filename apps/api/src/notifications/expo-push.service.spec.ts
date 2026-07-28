import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { ExpoPushService } from './expo-push.service';

describe('ExpoPushService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: ExpoPushService;
  const fetchMock = jest.fn();
  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new ExpoPushService(prisma);
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  it('posts the batch and counts ok tickets', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }) });
    const out = await service.send([
      { to: 'a', title: 't', body: 'b' },
      { to: 'c', title: 't', body: 'b' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('https://exp.host/--/api/v2/push/send', expect.objectContaining({ method: 'POST' }));
    expect(out.sent).toBe(2);
  });

  it('deletes tokens Expo reports as DeviceNotRegistered', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
    });
    prisma.patientPushToken.deleteMany.mockResolvedValue({ count: 1 } as any);
    const out = await service.send([
      { to: 'good', title: 't', body: 'b' },
      { to: 'stale', title: 't', body: 'b' },
    ]);
    expect(prisma.patientPushToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['stale'] } } });
    expect(out.tokensRemoved).toBe(1);
  });

  it('never throws when fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    await expect(service.send([{ to: 'a', title: 't', body: 'b' }])).resolves.toEqual({ sent: 0, tokensRemoved: 0 });
  });

  it('still reports the real sent count when token cleanup fails', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
    });
    prisma.patientPushToken.deleteMany.mockRejectedValue(new Error('db'));
    const out = await service.send([
      { to: 'good', title: 't', body: 'b' },
      { to: 'stale', title: 't', body: 'b' },
    ]);
    expect(out).toEqual({ sent: 1, tokensRemoved: 0 });
  });
});
