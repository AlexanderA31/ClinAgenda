import { z } from 'zod';
import { TimeOfDaySchema, cleaned, optionalCleanString, timeToMinutes } from './common';
import { cleanText } from '../validators/text';

/** Franja de atención semanal. weekday: 0 = domingo … 6 = sábado. */
export const WeeklySlotSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: TimeOfDaySchema,
    endTime: TimeOfDaySchema,
  })
  .refine((v) => timeToMinutes(v.endTime) > timeToMinutes(v.startTime), {
    message: 'La hora de cierre debe ser después de la hora de apertura.',
    path: ['endTime'],
  });
export type WeeklySlot = z.infer<typeof WeeklySlotSchema>;

export function slotsOverlap(a: WeeklySlot, b: WeeklySlot): boolean {
  return (
    a.weekday === b.weekday &&
    timeToMinutes(a.startTime) < timeToMinutes(b.endTime) &&
    timeToMinutes(b.startTime) < timeToMinutes(a.endTime)
  );
}

const IANA_ZONES = ['America/Guayaquil', 'Pacific/Galapagos'] as const;

export const ClinicCreateSchema = z
  .object({
    name: cleaned(cleanText, z.string({ required_error: 'Escriba el nombre.' }).min(3, 'El nombre debe tener al menos 3 letras.').max(80)),
    address: optionalCleanString(200, 'La dirección'),
    phone: optionalCleanString(30, 'El teléfono'),
    timezone: z.enum(IANA_ZONES).default('America/Guayaquil'),
    slotMinutes: z.number().int().min(10).max(120).default(30),
    schedule: z.array(WeeklySlotSchema).min(1, 'Indique al menos un día de atención.'),
  })
  .superRefine((v, ctx) => {
    v.schedule.forEach((slot, i) => {
      v.schedule.slice(i + 1).forEach((other, j) => {
        if (slotsOverlap(slot, other)) {
          ctx.addIssue({ code: 'custom', path: ['schedule', i + 1 + j], message: 'Este horario se cruza con otro del mismo día.' });
        }
      });
    });
  });
export type ClinicCreateInput = z.infer<typeof ClinicCreateSchema>;

export const ClinicUpdateSchema = ClinicCreateSchema.innerType().partial();
export type ClinicUpdateInput = z.infer<typeof ClinicUpdateSchema>;

/** Día cerrado (feriado, fumigación, etc.). */
export const ClosureCreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.'),
  reason: cleaned(cleanText, z.string({ required_error: 'Escriba el motivo del cierre.' }).min(3, 'Escriba el motivo del cierre.').max(120)),
});
export type ClosureCreateInput = z.infer<typeof ClosureCreateSchema>;

export interface ClinicView {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  slotMinutes: number;
  active: boolean;
  schedule: WeeklySlot[];
  closures: { id: string; date: string; reason: string }[];
}
