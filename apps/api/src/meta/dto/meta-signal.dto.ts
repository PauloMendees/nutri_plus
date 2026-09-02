import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  META_CUSTOM_EVENTS,
  META_STANDARD_EVENTS,
  type BillingPeriod,
  type MetaPublicSignalRequest,
  type MetaSignalRequest,
  type PlanTier,
} from '@nutri-plus/shared-types';

// Allowlist explícita por rota: a rota pública NÃO pode emitir Subscribe, e a
// autenticada NÃO pode emitir CompleteRegistration (que carrega e-mail no corpo).
const AUTHENTICATED_EVENTS: string[] = [
  ...META_STANDARD_EVENTS.filter((name: string) => name !== 'CompleteRegistration'),
  ...META_CUSTOM_EVENTS,
];

export class MetaSignalDto implements MetaSignalRequest {
  @IsIn(AUTHENTICATED_EVENTS)
  name!: MetaSignalRequest['name'];

  @IsOptional()
  @IsIn(['ESSENCIAL', 'PRO'])
  plan?: PlanTier;

  @IsOptional()
  @IsIn(['MONTHLY', 'YEARLY'])
  period?: BillingPeriod;
}

export class MetaPublicSignalDto implements MetaPublicSignalRequest {
  @IsIn(['CompleteRegistration'])
  name!: 'CompleteRegistration';

  @IsEmail()
  email!: string;

  // Nome que a pessoa acabou de digitar no cadastro. Hasheado em fn/ln no
  // servidor; melhora a correspondência do evento que hoje é o mais fraco.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_full?: string;
}
