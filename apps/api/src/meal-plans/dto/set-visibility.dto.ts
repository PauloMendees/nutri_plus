import { IsBoolean } from 'class-validator';

export class SetVisibilityDto {
  @IsBoolean()
  visibleToPatient!: boolean;
}
