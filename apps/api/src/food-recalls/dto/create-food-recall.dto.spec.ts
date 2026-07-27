import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFoodRecallDto } from './create-food-recall.dto';

describe('CreateFoodRecallDto recallDate', () => {
  // The web editor sends a date-only string ("YYYY-MM-DD") from <input type="date">.
  // It must transform into a Date so Prisma's DateTime column accepts it (a bare
  // date-only string is rejected by Prisma at persistence time).
  it('transforms a date-only string into a Date instance and validates', async () => {
    const dto = plainToInstance(CreateFoodRecallDto, {
      patientId: 'f4f69c98-f0c9-4215-a008-e30d3c2ea6da',
      recallDate: '2026-07-26',
      meals: [],
    });

    expect(dto.recallDate).toBeInstanceOf(Date);
    expect((dto.recallDate as unknown as Date).toISOString()).toBe('2026-07-26T00:00:00.000Z');

    const errs = await validate(dto);
    expect(errs).toHaveLength(0);
  });

  it('allows recallDate to be omitted (defaults to now() in the DB)', async () => {
    const dto = plainToInstance(CreateFoodRecallDto, {
      patientId: 'f4f69c98-f0c9-4215-a008-e30d3c2ea6da',
      meals: [],
    });
    const errs = await validate(dto);
    expect(errs.some((e) => e.property === 'recallDate')).toBe(false);
  });
});
