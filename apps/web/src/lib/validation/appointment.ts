import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

export const appointmentFormSchema = z
  .object({
    title: z.string().min(1, 'Informe um título.').max(200, 'Máximo de 200 caracteres.'),
    patientId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
    date: z.string().min(1, 'Informe a data.'),
    startTime: z.string().min(1, 'Informe o início.'),
    endTime: z.string().min(1, 'Informe o fim.'),
    description: z.preprocess(
      emptyToUndefined,
      z.string().max(2000, 'Máximo de 2000 caracteres.').optional(),
    ),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'O fim deve ser depois do início.',
    path: ['endTime'],
  });

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;
