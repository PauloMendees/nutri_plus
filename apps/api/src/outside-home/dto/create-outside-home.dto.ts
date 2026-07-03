import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateOutsideHomeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message!: string;
}
