import { describe, it, expect } from 'vitest';
import { missingPlanInputs, missingPlanInputsMessage } from '@nutri-plus/shared-types';

function completePatient() {
  return {
    height: 165,
    birthDate: '1990-05-12',
    gender: 'FEMALE',
    objective: 'WEIGHT_LOSS',
    activityLevel: 'MODERATE',
  };
}

describe('missingPlanInputs', () => {
  it('returns [] when the record is complete and the latest weight is present', () => {
    expect(missingPlanInputs(completePatient(), 68)).toEqual([]);
  });

  it('lists weight and height, in that order, when there is no assessment and no height', () => {
    expect(missingPlanInputs({ ...completePatient(), height: null }, null)).toEqual([
      'weight',
      'height',
    ]);
  });
});

describe('missingPlanInputsMessage', () => {
  it('names a single missing field without "e"', () => {
    expect(missingPlanInputsMessage(['weight'])).toBe(
      'Não dá para gerar o plano: falta peso (última avaliação).',
    );
  });

  it('joins three missing fields as "a, b e c"', () => {
    expect(missingPlanInputsMessage(['weight', 'height', 'objective'])).toBe(
      'Não dá para gerar o plano: falta peso (última avaliação), altura e objetivo.',
    );
  });
});
