import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { OnboardingChapterStatus, PatchOnboardingTourRequest } from '@nutri-plus/shared-types';

export class PatchTourDto implements PatchOnboardingTourRequest {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  chapterId?: string;

  @IsOptional()
  @IsIn(['IN_PROGRESS', 'COMPLETED', 'SKIPPED'])
  chapterStatus?: OnboardingChapterStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  furthestStepId?: string;

  @IsOptional()
  @IsString()
  demoPatientId?: string | null;

  @IsOptional()
  @IsIn(['COMPLETED'])
  tourStatus?: 'COMPLETED';
}
