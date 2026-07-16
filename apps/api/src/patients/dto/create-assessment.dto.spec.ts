import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAssessmentDto } from './create-assessment.dto';

const errorsFor = (obj: Record<string, unknown>) =>
  validate(plainToInstance(CreateAssessmentDto, obj));

describe('CreateAssessmentDto bounds', () => {
  it('rejects a percentage above 100', async () => {
    const errs = await errorsFor({ bodyFatPercentage: 150 });
    expect(errs.some((e) => e.property === 'bodyFatPercentage' && e.constraints?.max)).toBe(true);
  });

  it('accepts a percentage of exactly 100', async () => {
    const errs = await errorsFor({ bodyFatPercentage: 100 });
    expect(errs).toHaveLength(0);
  });

  it('rejects an over-max weight', async () => {
    const errs = await errorsFor({ weight: 9999 });
    expect(errs.some((e) => e.property === 'weight' && e.constraints?.max)).toBe(true);
  });

  it('still accepts legacy kg muscleMass/leanMass within bound (backward compat)', async () => {
    const errs = await errorsFor({ muscleMass: 40, leanMass: 55 });
    expect(errs).toHaveLength(0);
  });

  it('accepts a fully valid payload', async () => {
    const errs = await errorsFor({ weight: 80, bodyFatPercentage: 20, waistCircumference: 90, metabolicAge: 30 });
    expect(errs).toHaveLength(0);
  });
});
