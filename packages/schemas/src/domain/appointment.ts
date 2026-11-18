import { z } from 'zod';
import { AppointmentStatusSchema, CancelReasonSchema } from './enums';
import { optionalCleanString } from './common';

/** Fecha y hora con zona horaria explícita: "2026-11-23T09:30:00-05:00" o en UTC "…Z". */
export const DateTimeSchema = z
  .string({ required_error: 'Elija la fecha y la hora.' })
  .datetime({ offset: true, message: 'Fecha y hora no válidas.' });

export const AppointmentCreateSchema = z.object({
  patientId: z.string({ required_error: 'Elija un paciente.' }).uuid('Elija un paciente.'),
  doctorId: z.string({ required_error: 'Elija un médico.' }).uuid('Elija un médico.'),
  clinicId: z.string({ required_error: 'Elija una clínica.' }).uuid('Elija una clínica.'),
  startsAt: DateTimeSchema,
  durationMinutes: z.number().int().min(10, 'Una cita dura al menos 10 minutos.').max(180, 'Una cita no puede durar más de 3 horas.').optional(),
  reason: optionalCleanString(200, 'El motivo de la consulta'),
  /** Si se agenda desde la lista de espera, se marca esa entrada como resuelta. */
  waitlistEntryId: z.string().uuid().optional().nullable(),
});
export type AppointmentCreateInput = z.input<typeof AppointmentCreateSchema>;
export type AppointmentCreate = z.output<typeof AppointmentCreateSchema>;

export const AppointmentRescheduleSchema = z.object({
  startsAt: DateTimeSchema,
  doctorId: z.string().uuid().optional(),
  clinicId: z.string().uuid().optional(),
  durationMinutes: z.number().int().min(10).max(180).optional(),
});
export type AppointmentRescheduleInput = z.infer<typeof AppointmentRescheduleSchema>;

export const AppointmentCancelSchema = z
  .object({
    reason: CancelReasonSchema,
    note: optionalCleanString(200, 'La nota'),
  })
  .refine((v) => v.reason !== 'OTRO' || Boolean(v.note), { path: ['note'], message: 'Escriba brevemente el motivo.' });
export type AppointmentCancelInput = z.infer<typeof AppointmentCancelSchema>;

export const AppointmentStatusUpdateSchema = z.object({
  status: z.enum(['ATTENDED', 'NO_SHOW']),
});
export type AppointmentStatusUpdateInput = z.infer<typeof AppointmentStatusUpdateSchema>;

/** Solo médicos y dirección. Recepción nunca recibe este campo. */
export const ClinicalNoteSchema = z.object({
  clinicalNote: optionalCleanString(4000, 'La nota clínica'),
});
export type ClinicalNoteInput = z.infer<typeof ClinicalNoteSchema>;

export const AppointmentListQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.').optional(),
  clinicId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  status: AppointmentStatusSchema.optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  sortBy: z.enum(['startsAt', 'createdAt', 'status']).default('startsAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type AppointmentListQuery = z.infer<typeof AppointmentListQuerySchema>;

export const AvailabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.'),
  clinicId: z.string().uuid(),
  doctorId: z.string().uuid().optional(),
});
export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;

export interface AvailabilitySlot {
  doctorId: string;
  doctorName: string;
  startsAt: string;
  endsAt: string;
  /** Hora local de la clínica, lista para mostrar ("09:30"). */
  label: string;
  available: boolean;
}

export interface AppointmentView {
  id: string;
  code: string;
  status: z.infer<typeof AppointmentStatusSchema>;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  patient: { id: string; fullName: string; phone: string | null; documentNumber: string | null; age: number };
  doctor: { id: string; fullName: string; specialty: string };
  clinic: { id: string; name: string; timezone: string };
  cancelReason: z.infer<typeof CancelReasonSchema> | null;
  cancelNote: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Presente solo para MEDICO (su propio paciente) y ADMIN. */
  clinicalNote?: string | null;
  /** true cuando la cita cancelada todavía puede reactivarse (el horario sigue libre y no ha pasado). */
  canUndoCancel?: boolean;
}

export interface AppointmentEventView {
  id: string;
  type: string;
  at: string;
  by: string | null;
  summary: string;
}
