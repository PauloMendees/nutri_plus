import { IsNotEmpty, IsString } from 'class-validator';

export class AcceptConsentDto {
  @IsString()
  @IsNotEmpty()
  policyVersion!: string;
}
