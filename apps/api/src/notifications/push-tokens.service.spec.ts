import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { PushTokensService } from './push-tokens.service';
import { AuthContext } from '../auth/types/auth-context';

const ctx = { user: { role: 'PATIENT', patientProfile: { id: 'p1' } } } as unknown as AuthContext;

describe('PushTokensService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: PushTokensService;
  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new PushTokensService(prisma);
  });

  it('upserts a token bound to the current patient', async () => {
    await service.register(ctx, { token: 'ExpoTok', platform: 'ios' });
    expect(prisma.patientPushToken.upsert).toHaveBeenCalledWith({
      where: { token: 'ExpoTok' },
      create: { patientId: 'p1', token: 'ExpoTok', platform: 'ios' },
      update: { patientId: 'p1', platform: 'ios' },
    });
  });

  it('deletes a token scoped to the current patient (no cross-patient delete)', async () => {
    await service.unregister(ctx, 'ExpoTok');
    expect(prisma.patientPushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'ExpoTok', patientId: 'p1' },
    });
  });
});
