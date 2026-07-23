import { IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateAudioDto {
  @IsString()
  consentConfirmed!: string; // 'true' | 'false' (multipart)

  @IsOptional()
  @IsNumberString()
  durationSec?: string;
}
