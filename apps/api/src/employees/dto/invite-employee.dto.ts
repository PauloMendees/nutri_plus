import { IsEmail, IsString, MaxLength } from 'class-validator';

export class InviteEmployeeDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;
}
