import { BadRequestException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentService } from './consent.service';
import { AuthContext } from '../auth/types/auth-context';
import { CURRENT_PRIVACY_POLICY_VERSION } from '@nutri-plus/shared-types';

const ctx = { user: { role: 'PATIENT', patientProfile: { id: 'p1' } } } as unknown as AuthContext;

describe('ConsentService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: ConsentService;
  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new ConsentService(prisma);
  });

  it('needsConsent=true when there is no consent yet', async () => {
    prisma.patientConsent.findFirst.mockResolvedValue(null);
    const s = await service.getMine(ctx);
    expect(s).toEqual({
      currentVersion: CURRENT_PRIVACY_POLICY_VERSION,
      acceptedVersion: null,
      acceptedAt: null,
      needsConsent: true,
    });
  });

  it('needsConsent=true when the accepted version is stale', async () => {
    prisma.patientConsent.findFirst.mockResolvedValue({
      id: 'c0', patientId: 'p1', policyVersion: '2000-01-01', acceptedAt: new Date('2020-01-01'),
    } as any);
    const s = await service.getMine(ctx);
    expect(s.needsConsent).toBe(true);
    expect(s.acceptedVersion).toBe('2000-01-01');
  });

  it('needsConsent=false when the accepted version is current', async () => {
    prisma.patientConsent.findFirst.mockResolvedValue({
      id: 'c1', patientId: 'p1', policyVersion: CURRENT_PRIVACY_POLICY_VERSION, acceptedAt: new Date('2026-07-10'),
    } as any);
    const s = await service.getMine(ctx);
    expect(s.needsConsent).toBe(false);
    expect(s.acceptedAt).toBe(new Date('2026-07-10').toISOString());
  });

  it('accept records a consent at the current version and returns needsConsent=false', async () => {
    prisma.patientConsent.create.mockResolvedValue({} as any);
    prisma.patientConsent.findFirst.mockResolvedValue({
      id: 'c2', patientId: 'p1', policyVersion: CURRENT_PRIVACY_POLICY_VERSION, acceptedAt: new Date('2026-07-11'),
    } as any);
    const s = await service.accept(ctx, { policyVersion: CURRENT_PRIVACY_POLICY_VERSION });
    expect(prisma.patientConsent.create).toHaveBeenCalledWith({
      data: { patientId: 'p1', policyVersion: CURRENT_PRIVACY_POLICY_VERSION },
    });
    expect(s.needsConsent).toBe(false);
  });

  it('accept rejects a mismatched policyVersion (400) without creating', async () => {
    await expect(service.accept(ctx, { policyVersion: '2000-01-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.patientConsent.create).not.toHaveBeenCalled();
  });
});
