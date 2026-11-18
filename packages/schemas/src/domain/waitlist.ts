import { z } from 'zod';
import { IsoDateTimeSchema, optionalCleanString } from './common';

export const WaitlistCreateSchema = z.object({
  patientId: z.string().uuid('Elija un paciente.'),
  clinicId: z.string().uuid('Elija una clínica.'),
  doctorId: z.string().uuid().optional().nullable(),
  /** Preferencia libre: "mañanas", "después de las 3". */
  preference: optionalCleanString(200, 'La preferencia'),
});
export type WaitlistCreateInput = z.infer<typeof WaitlistCreateSchema>;

export const WaitlistEntryViewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['WAITING', 'OFFERED', 'BOOKED', 'REMOVED']),
  preference: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  patient: z.object({ id: z.string().uuid(), fullName: z.string(), phone: z.string().nullable() }),
  clinic: z.object({ id: z.string().uuid(), name: z.string() }),
  doctor: z.object({ id: z.string().uuid(), fullName: z.string() }).nullable(),
});
export type WaitlistEntryView = z.infer<typeof WaitlistEntryViewSchema>;
