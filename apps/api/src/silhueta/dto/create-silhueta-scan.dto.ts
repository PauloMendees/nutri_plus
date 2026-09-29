import { Type, Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

// Multipart text fields arrive as strings, so numeric fields are coerced with
// @Type(() => Number) and consent (sent as 'true'/'false') via @Transform.
export class CreateSilhuetaScanDto {
  // Altura e peso são obrigatórios: sem eles a estimativa não tem escala.
  // Min > 0 fecha o buraco de um 0 "presente porém impossível" — passava em
  // @IsNumber() mesmo não sendo um corpo humano.
  @Type(() => Number)
  @IsNumber()
  @Min(50)
  @Max(300)
  heightCm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(2)
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
