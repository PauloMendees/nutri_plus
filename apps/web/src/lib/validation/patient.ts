import { z } from 'zod';
import { ActivityLevel, Gender, PatientObjective } from '@nutri-plus/shared-types';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().max(max, `Máximo de ${max} caracteres.`).optional());

const optionalPositive = z.preprocess(
  emptyToUndefined,
  z.coerce.number().positive('Deve ser maior que zero.').optional(),
);

const optionalBirthDate = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida.')
    .refine((v) => v.slice(0, 10) <= new Date().toISOString().slice(0, 10), 'A data não pode ser futura.')
    .optional(),
);

const clinicalShape = {
  birthDate: optionalBirthDate,
  gender: z.preprocess(emptyToUndefined, z.nativeEnum(Gender).optional()),
  height: optionalPositive,
  targetWeight: optionalPositive,
  objective: z.preprocess(emptyToUndefined, z.nativeEnum(PatientObjective).optional()),
  activityLevel: z.preprocess(emptyToUndefined, z.nativeEnum(ActivityLevel).optional()),
  restrictions: optionalText(2000),
  allergies: optionalText(2000),
  medicalConditions: optionalText(2000),
  notes: optionalText(2000),
};

export const updatePatientSchema = z.object(clinicalShape);

export const createPatientSchema = z.object({
  name: z.string().min(2, 'Informe o nome do paciente.').max(200),
  email: z.string().email('Informe um e-mail válido.').max(320),
  ...clinicalShape,
});

export type CreatePatientValues = z.infer<typeof createPatientSchema>;
export type UpdatePatientValues = z.infer<typeof updatePatientSchema>;
