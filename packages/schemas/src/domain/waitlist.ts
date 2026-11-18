import { z } from 'zod';
import { optionalCleanString } from './common';

export const WaitlistCreateSchema = z.object({
  patientId: z.string().uuid('Elija un paciente.'),
  clinicId: z.string().uuid('Elija una clínica.'),
  doctorId: z.string().uuid().optional().nullable(),
  /** Preferencia libre: "mañanas", "después de las 3". */
  preference: optionalCleanString(200, 'La preferencia'),
});
export type WaitlistCreateInput = z.infer<typeof WaitlistCreateSchema>;

export interface WaitlistEntryView {
  id: string;
  status: 'WAITING' | 'OFFERED' | 'BOOKED' | 'REMOVED';
  preference: string | null;
  createdAt: string;
  patient: { id: string; fullName: string; phone: string | null };
  clinic: { id: string; name: string };
  doctor: { id: string; fullName: string } | null;
}
