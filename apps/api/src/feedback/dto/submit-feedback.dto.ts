import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { FEEDBACK_COMMENT_MAX } from '@nutri-plus/shared-types';

export class SubmitFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(FEEDBACK_COMMENT_MAX)
  comment?: string;
}
