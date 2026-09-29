import { Type, Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

// Multipart text fields arrive as strings, so numeric fields are coerced with
// @Type(() => Number) and consent (sent as 'true'/'false') via @Transform.
export class CreateSilhuetaScanDto {
  // Altura e peso são obrigatórios: sem eles a estimativa não tem escala.
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(300)
  heightCm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(500)
  weightKg!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(300)
  waistInput?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(300)
  hipInput?: number;

  // multipart sends 'true'/'false' strings
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  consent!: boolean;
}
