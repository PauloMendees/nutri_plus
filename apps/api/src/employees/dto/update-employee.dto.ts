import { IsString, MaxLength } from 'class-validator';

export class UpdateEmployeeDto {
  @IsString()
  @MaxLength(200)
  name!: string;
}
