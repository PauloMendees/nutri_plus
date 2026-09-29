import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSilhuetaScanDto } from './create-silhueta-scan.dto';

// Multipart: tudo chega como string.
const errorsFor = (obj: Record<string, unknown>) =>
  validate(plainToInstance(CreateSilhuetaScanDto, obj));

describe('CreateSilhuetaScanDto', () => {
  it('rejects a scan without height', async () => {
    const errs = await errorsFor({ weightKg: '70', consent: 'true' });
    expect(errs.some((e) => e.property === 'heightCm')).toBe(true);
  });

  it('rejects a scan without weight', async () => {
    const errs = await errorsFor({ heightCm: '170', consent: 'true' });
    expect(errs.some((e) => e.property === 'weightKg')).toBe(true);
  });

  it('accepts height and weight with waist and hip omitted', async () => {
    const errs = await errorsFor({ heightCm: '170', weightKg: '70', consent: 'true' });
    expect(errs).toEqual([]);
  });

  // '0' passa em @IsNumber()/obrigatoriedade mas não é uma altura/peso
  // possível — sem um mínimo fisiológico a estimativa aceitava um corpo de
  // altura ou peso zero.
  it('rejects a height of 0', async () => {
    const errs = await errorsFor({ heightCm: '0', weightKg: '70', consent: 'true' });
    expect(errs.some((e) => e.property === 'heightCm')).toBe(true);
  });

  it('rejects a weight of 0', async () => {
    const errs = await errorsFor({ heightCm: '170', weightKg: '0', consent: 'true' });
    expect(errs.some((e) => e.property === 'weightKg')).toBe(true);
  });
});
