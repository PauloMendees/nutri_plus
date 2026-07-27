import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseAdminService } from '../../supabase/supabase-admin.service';
import { OpenAIProvider } from '../../ai/openai.provider';
import type { TranscriptStatus } from '../../generated/prisma/client';
import { AuthContext } from '../../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../../auth/auth-scope';
import { CreateAudioDto } from './dto/create-audio.dto';

const AUDIO_BUCKET = 'consultation-audio';
const SIGNED_TTL = 3600;
const STALE_TRANSCRIPTION_MS = 10 * 60 * 1000;

const extFromMime = (mimetype: string): string => {
  const subtype = mimetype.split(';')[0].split('/')[1] ?? 'webm';
  const map: Record<string, string> = { mpeg: 'mp3', mp4: 'm4a', 'x-m4a': 'm4a' };
  return map[subtype] ?? subtype;
};

type AudioRow = {
  id: string; patientId: string; mimeType: string; durationSec: number | null;
  consentConfirmed: boolean; recordedAt: Date; storagePath: string;
  transcript: string | null; transcriptStatus: TranscriptStatus | null;
  transcribedAt: Date | null; transcriptError: string | null;
  transcriptStartedAt: Date | null;
};

@Injectable()
export class AudiosService {
  private readonly logger = new Logger(AudiosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: SupabaseAdminService,
    private readonly openai: OpenAIProvider,
  ) {}

  private async requireOwnedPatient(ctx: AuthContext, patientId: string) {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
  }

  private async toDto({ storagePath, transcriptStartedAt, ...row }: AudioRow) {
    return { ...row, signedUrl: await this.admin.createSignedUrl(AUDIO_BUCKET, storagePath, SIGNED_TTL) };
  }

  async create(ctx: AuthContext, patientId: string, file: { buffer: Buffer; mimetype: string }, dto: CreateAudioDto) {
    await this.requireOwnedPatient(ctx, patientId);
    if (dto.consentConfirmed !== 'true') {
      throw new BadRequestException('É necessário o consentimento do paciente para gravar.');
    }
    // Validate the client-declared audio mimetype here (not via FileTypeValidator):
    // MediaRecorder produces webm/mp4/ogg, and webm is an EBML container that
    // magic-number sniffing reports as video/webm, wrongly failing an /^audio\// check.
    if (!file.mimetype.startsWith('audio/')) {
      throw new BadRequestException('Arquivo de áudio inválido.');
    }
    const id = randomUUID();
    const storagePath = `${patientId}/${id}.${extFromMime(file.mimetype)}`;
    await this.admin.uploadObject(AUDIO_BUCKET, storagePath, file.buffer, file.mimetype);
    const audio = await this.prisma.consultationAudio.create({
      data: {
        id,
        patientId,
        storagePath,
        mimeType: file.mimetype,
        durationSec: dto.durationSec ? Number(dto.durationSec) : null,
        consentConfirmed: true,
      },
    });
    return this.toDto(audio as AudioRow);
  }

  async list(ctx: AuthContext, patientId: string) {
    await this.requireOwnedPatient(ctx, patientId);
    const rows = await this.prisma.consultationAudio.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
    });
    return Promise.all(rows.map((r) => this.toDto(r as AudioRow)));
  }

  async delete(ctx: AuthContext, patientId: string, audioId: string) {
    await this.requireOwnedPatient(ctx, patientId);
    const audio = await this.prisma.consultationAudio.findFirst({ where: { id: audioId, patientId } });
    if (!audio) throw new NotFoundException('Audio not found');
    await this.admin.removeObject(AUDIO_BUCKET, audio.storagePath);
    await this.prisma.consultationAudio.delete({ where: { id: audioId } });
  }

  async transcribe(ctx: AuthContext, patientId: string, audioId: string) {
    await this.requireOwnedPatient(ctx, patientId);
    const audio = await this.prisma.consultationAudio.findFirst({ where: { id: audioId, patientId } });
    if (!audio) throw new NotFoundException('Audio not found');

    // Reserva PROCESSING de forma atômica: começa de null/FAILED, ou reclama uma
    // linha PROCESSING travada (sem transcriptStartedAt, ou iniciada há mais de
    // STALE_TRANSCRIPTION_MS — API reiniciada no meio da transcrição).
    // Se já está genuinamente PROCESSING (início recente) ou DONE, count===0 →
    // devolve o atual sem reprocessar. OR null-safe: `{ in: [null, ...] }` não casa
    // linhas NULL em SQL.
    const staleBefore = new Date(Date.now() - STALE_TRANSCRIPTION_MS);
    const claim = await this.prisma.consultationAudio.updateMany({
      where: {
        id: audioId,
        OR: [
          { transcriptStatus: null },
          { transcriptStatus: 'FAILED' },
          { transcriptStatus: 'PROCESSING', transcriptStartedAt: null },
          { transcriptStatus: 'PROCESSING', transcriptStartedAt: { lt: staleBefore } },
        ],
      },
      data: { transcriptStatus: 'PROCESSING', transcriptError: null, transcriptStartedAt: new Date() },
    });
    if (claim.count === 0) {
      return this.toDto(audio as AudioRow);
    }

    // Fire-and-forget: o POST retorna agora; a transcrição segue em background.
    void this.runTranscription(audioId, patientId, audio.storagePath, audio.durationSec);

    const fresh = await this.prisma.consultationAudio.findUnique({ where: { id: audioId } });
    if (!fresh) throw new NotFoundException('Audio not found');
    return this.toDto(fresh as AudioRow);
  }

  // Background: nunca lança (o request já respondeu). Falha vira FAILED.
  private async runTranscription(
    audioId: string,
    patientId: string,
    storagePath: string,
    durationSec: number | null,
  ): Promise<void> {
    try {
      const buffer = await this.admin.downloadObject(AUDIO_BUCKET, storagePath);
      const ext = storagePath.split('.').pop() ?? 'webm';
      const transcript = await this.openai.transcribeAudio(buffer, `audio.${ext}`, { patientId, durationSec });
      await this.prisma.consultationAudio.update({
        where: { id: audioId },
        data: { transcript, transcriptStatus: 'DONE', transcribedAt: new Date(), transcriptError: null },
      });
    } catch {
      await this.prisma.consultationAudio
        .update({
          where: { id: audioId },
          data: { transcriptStatus: 'FAILED', transcriptError: 'Não foi possível transcrever o áudio.' },
        })
        .catch(() => undefined);
      this.logger.warn(`Transcription failed (audioId=${audioId})`);
    }
  }
}
