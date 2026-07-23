import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseAdminService } from '../../supabase/supabase-admin.service';
import { AudiosService } from './audios.service';
import { AuthContext } from '../../auth/types/auth-context';

const ctx = { user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'n1' } } } as unknown as AuthContext;
const file = { buffer: Buffer.from('x'), mimetype: 'audio/webm' };

describe('AudiosService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let admin: DeepMockProxy<SupabaseAdminService>;
  let service: AudiosService;
  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    admin = mockDeep<SupabaseAdminService>();
    service = new AudiosService(prisma, admin);
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    admin.createSignedUrl.mockResolvedValue('https://signed/x');
  });

  it('rejects a recording without consent (400) and uploads nothing', async () => {
    await expect(service.create(ctx, 'p1', file, { consentConfirmed: 'false' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(admin.uploadObject).not.toHaveBeenCalled();
    expect(prisma.consultationAudio.create).not.toHaveBeenCalled();
  });

  it('uploads to the private bucket and creates the row, returning a signed url (no storagePath)', async () => {
    prisma.consultationAudio.create.mockResolvedValue({
      id: 'au1', patientId: 'p1', mimeType: 'audio/webm', durationSec: 12, consentConfirmed: true,
      recordedAt: new Date('2026-07-23'), storagePath: 'p1/au1.webm',
    } as any);
    const out = await service.create(ctx, 'p1', file, { consentConfirmed: 'true', durationSec: '12' });
    expect(admin.uploadObject).toHaveBeenCalledWith('consultation-audio', expect.stringMatching(/^p1\/.+\.webm$/), file.buffer, 'audio/webm');
    expect(out.signedUrl).toBe('https://signed/x');
    expect(out).not.toHaveProperty('storagePath');
  });

  it('list returns each audio with a signed url', async () => {
    prisma.consultationAudio.findMany.mockResolvedValue([
      { id: 'au1', patientId: 'p1', mimeType: 'audio/webm', durationSec: null, consentConfirmed: true, recordedAt: new Date(), storagePath: 'p1/au1.webm' },
    ] as any);
    const out = await service.list(ctx, 'p1');
    expect(out[0].signedUrl).toBe('https://signed/x');
    expect(out[0]).not.toHaveProperty('storagePath');
  });

  it('delete removes the object then the row; 404 for a non-owned audio', async () => {
    prisma.consultationAudio.findFirst.mockResolvedValueOnce({ id: 'au1', patientId: 'p1', storagePath: 'p1/au1.webm' } as any);
    await service.delete(ctx, 'p1', 'au1');
    expect(admin.removeObject).toHaveBeenCalledWith('consultation-audio', 'p1/au1.webm');
    expect(prisma.consultationAudio.delete).toHaveBeenCalledWith({ where: { id: 'au1' } });

    prisma.consultationAudio.findFirst.mockResolvedValueOnce(null);
    await expect(service.delete(ctx, 'p1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
