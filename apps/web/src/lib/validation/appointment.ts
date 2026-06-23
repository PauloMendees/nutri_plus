import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

export const appointmentFormSchema = z
  .object({
    title: z.string().min(1, 'Informe um título.').max(200, 'Máximo de 200 caracteres.'),
    patientId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    categoryId: z.preprocess(emptyToUndefined, z.string().optional()),
    date: z.string().min(1, 'Informe a data.'),
    startTime: z.string().min(1, 'Informe o início.'),
    endTime: z.string().min(1, 'Informe o fim.'),
    description: z.preprocess(
      emptyToUndefined,
      z.string().max(2000, 'Máximo de 2000 caracteres.').optional(),
    ),
  })
  // Skip when either time is empty so the field's own "required" message is the
  // sole feedback (an empty endTime would otherwise also fail this compare).
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
    message: 'O fim deve ser depois do início.',
    path: ['endTime'],
  });

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;
