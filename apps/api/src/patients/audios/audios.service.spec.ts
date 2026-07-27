import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseAdminService } from '../../supabase/supabase-admin.service';
import { OpenAIProvider } from '../../ai/openai.provider';
import { AudiosService } from './audios.service';
import { AuthContext } from '../../auth/types/auth-context';

const ctx = { user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'n1' } } } as unknown as AuthContext;
const file = { buffer: Buffer.from('x'), mimetype: 'audio/webm' };

describe('AudiosService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let admin: DeepMockProxy<SupabaseAdminService>;
  let openai: DeepMockProxy<OpenAIProvider>;
  let service: AudiosService;
  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    admin = mockDeep<SupabaseAdminService>();
    openai = mockDeep<OpenAIProvider>();
    service = new AudiosService(prisma, admin, openai);
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

  it('rejects a non-audio mimetype (400) and uploads/creates nothing', async () => {
    await expect(
      service.create(ctx, 'p1', { buffer: Buffer.from('x'), mimetype: 'image/png' }, { consentConfirmed: 'true' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(admin.uploadObject).not.toHaveBeenCalled();
    expect(prisma.consultationAudio.create).not.toHaveBeenCalled();
  });

  it('accepts audio/webm (client mimetype), not blocked by container magic-number sniffing', async () => {
    prisma.consultationAudio.create.mockResolvedValue({
      id: 'au2', patientId: 'p1', mimeType: 'audio/webm', durationSec: null, consentConfirmed: true,
      recordedAt: new Date(), storagePath: 'p1/au2.webm',
    } as any);
    await expect(
      service.create(ctx, 'p1', { buffer: Buffer.from('x'), mimetype: 'audio/webm' }, { consentConfirmed: 'true' }),
    ).resolves.toBeDefined();
    expect(admin.uploadObject).toHaveBeenCalled();
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

  const audioRow = (over: Partial<any> = {}) => ({
    id: 'au1', patientId: 'p1', mimeType: 'audio/webm', durationSec: 12, consentConfirmed: true,
    recordedAt: new Date('2026-07-23'), storagePath: 'p1/au1.webm',
    transcript: null, transcriptStatus: null, transcribedAt: null, transcriptError: null,
    transcriptStartedAt: null, ...over,
  });

  describe('transcribe', () => {
    it('claims PROCESSING atomically and returns immediately (dto exposes status, hides storagePath)', async () => {
      prisma.consultationAudio.findFirst.mockResolvedValue(audioRow() as any);
      prisma.consultationAudio.updateMany.mockResolvedValue({ count: 1 } as any);
      prisma.consultationAudio.findUnique.mockResolvedValue(audioRow({ transcriptStatus: 'PROCESSING' }) as any);
      admin.downloadObject.mockResolvedValue(Buffer.from('x'));
      openai.transcribeAudio.mockResolvedValue('texto');
      prisma.consultationAudio.update.mockResolvedValue(audioRow() as any);

      const out: any = await service.transcribe(ctx, 'p1', 'au1');

      expect(prisma.consultationAudio.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'au1',
          OR: [
            { transcriptStatus: null },
            { transcriptStatus: 'FAILED' },
            { transcriptStatus: 'PROCESSING', transcriptStartedAt: null },
            { transcriptStatus: 'PROCESSING', transcriptStartedAt: { lt: expect.any(Date) } },
          ],
        },
        data: { transcriptStatus: 'PROCESSING', transcriptError: null, transcriptStartedAt: expect.any(Date) },
      });
      expect(out.transcriptStatus).toBe('PROCESSING');
      expect(out.signedUrl).toBe('https://signed/x');
      expect(out.storagePath).toBeUndefined();
    });

    it('is idempotent: an already PROCESSING/DONE audio (claim count 0) does not reprocess', async () => {
      prisma.consultationAudio.findFirst.mockResolvedValue(audioRow({ transcriptStatus: 'DONE', transcript: 't' }) as any);
      prisma.consultationAudio.updateMany.mockResolvedValue({ count: 0 } as any);

      const out: any = await service.transcribe(ctx, 'p1', 'au1');

      expect(out.transcriptStatus).toBe('DONE');
      expect(admin.downloadObject).not.toHaveBeenCalled();
      expect(openai.transcribeAudio).not.toHaveBeenCalled();
    });

    it('re-claims a stale PROCESSING row (claim count 1) and proceeds instead of early-returning', async () => {
      prisma.consultationAudio.findFirst.mockResolvedValue(
        audioRow({ transcriptStatus: 'PROCESSING', transcriptStartedAt: new Date('2026-07-01') }) as any,
      );
      prisma.consultationAudio.updateMany.mockResolvedValue({ count: 1 } as any);
      prisma.consultationAudio.findUnique.mockResolvedValue(
        audioRow({ transcriptStatus: 'PROCESSING', transcriptStartedAt: new Date() }) as any,
      );
      admin.downloadObject.mockResolvedValue(Buffer.from('x'));
      openai.transcribeAudio.mockResolvedValue('texto');
      prisma.consultationAudio.update.mockResolvedValue(audioRow() as any);

      const out: any = await service.transcribe(ctx, 'p1', 'au1');

      expect(prisma.consultationAudio.findUnique).toHaveBeenCalledWith({ where: { id: 'au1' } });
      expect(out.transcriptStatus).toBe('PROCESSING');
    });

    it('404s when the patient is not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);
      await expect(service.transcribe(ctx, 'pX', 'au1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s when the audio is not the patient’s', async () => {
      prisma.consultationAudio.findFirst.mockResolvedValue(null);
      await expect(service.transcribe(ctx, 'p1', 'auX')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('runTranscription (background)', () => {
    it('on success writes transcript + DONE + transcribedAt', async () => {
      admin.downloadObject.mockResolvedValue(Buffer.from('x'));
      openai.transcribeAudio.mockResolvedValue('olá');
      prisma.consultationAudio.update.mockResolvedValue({} as any);

      await (service as any).runTranscription('au1', 'p1', 'p1/au1.webm', 12);

      expect(prisma.consultationAudio.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'au1' },
          data: expect.objectContaining({ transcript: 'olá', transcriptStatus: 'DONE' }),
        }),
      );
    });

    it('on failure writes FAILED + error and never throws', async () => {
      admin.downloadObject.mockRejectedValue(new Error('boom'));
      prisma.consultationAudio.update.mockResolvedValue({} as any);

      await expect((service as any).runTranscription('au1', 'p1', 'p1/au1.webm', 12)).resolves.toBeUndefined();

      expect(prisma.consultationAudio.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ transcriptStatus: 'FAILED' }) }),
      );
    });
  });
});
