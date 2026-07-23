import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseAdminService } from '../../supabase/supabase-admin.service';
import { AuthContext } from '../../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../../auth/auth-scope';
import { CreateAudioDto } from './dto/create-audio.dto';

const AUDIO_BUCKET = 'consultation-audio';
const SIGNED_TTL = 3600;

const extFromMime = (mimetype: string): string => {
  const subtype = mimetype.split(';')[0].split('/')[1] ?? 'webm';
  const map: Record<string, string> = { mpeg: 'mp3', mp4: 'm4a', 'x-m4a': 'm4a' };
  return map[subtype] ?? subtype;
};

type AudioRow = {
  id: string; patientId: string; mimeType: string; durationSec: number | null;
  consentConfirmed: boolean; recordedAt: Date; storagePath: string;
};

@Injectable()
export class AudiosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: SupabaseAdminService,
  ) {}

  private async requireOwnedPatient(ctx: AuthContext, patientId: string) {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
  }

  private async toDto({ storagePath, ...row }: AudioRow) {
    return { ...row, signedUrl: await this.admin.createSignedUrl(AUDIO_BUCKET, storagePath, SIGNED_TTL) };
  }

  async create(ctx: AuthContext, patientId: string, file: { buffer: Buffer; mimetype: string }, dto: CreateAudioDto) {
    await this.requireOwnedPatient(ctx, patientId);
    if (dto.consentConfirmed !== 'true') {
      throw new BadRequestException('É necessário o consentimento do paciente para gravar.');
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
}
