import { z } from 'zod';
import { AppointmentStatusSchema, CancelReasonSchema } from './enums';
import { IsoDateTimeSchema, optionalCleanString } from './common';

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
    reason: CancelReasonSchema.exclude(['PACIENTE_WEB', 'SOLICITUD_RECHAZADA']),
    note: optionalCleanString(200, 'La nota'),
  })
  .refine((v) => v.reason !== 'OTRO' || Boolean(v.note), { path: ['note'], message: 'Escriba brevemente el motivo.' });
export type AppointmentCancelInput = z.infer<typeof AppointmentCancelSchema>;

/** Rechazar una solicitud en línea: la nota se le muestra al paciente (por ejemplo, "el médico no atiende ese día"). */
export const AppointmentRejectSchema = z.object({
  note: optionalCleanString(200, 'La nota'),
});
export type AppointmentRejectInput = z.infer<typeof AppointmentRejectSchema>;

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

export const AvailabilitySlotSchema = z.object({
  doctorId: z.string().uuid(),
  doctorName: z.string(),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  /** Hora local de la clínica, lista para mostrar ("09:30"). */
  label: z.string(),
  available: z.boolean(),
});
export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

export const AppointmentViewSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  status: AppointmentStatusSchema,
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  reason: z.string().nullable(),
  patient: z.object({ id: z.string().uuid(), fullName: z.string(), phone: z.string().nullable(), documentNumber: z.string().nullable(), age: z.number().int() }),
  doctor: z.object({ id: z.string().uuid(), fullName: z.string(), specialty: z.string() }),
  clinic: z.object({ id: z.string().uuid(), name: z.string(), timezone: z.string() }),
  cancelReason: CancelReasonSchema.nullable(),
  cancelNote: z.string().nullable(),
  cancelledAt: IsoDateTimeSchema.nullable(),
  cancelledBy: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  /** Presente solo para MEDICO (su propio paciente) y ADMIN. */
  clinicalNote: z.string().nullable().optional(),
  /** true cuando la cita cancelada todavía puede reactivarse (el horario sigue libre y no ha pasado). */
  canUndoCancel: z.boolean().optional(),
  /** Ruta del enlace del paciente (/c/<token>): ver su cita y cancelarla sin llamar. Solo para el personal. */
  patientLink: z.string().optional(),
  remindedAt: IsoDateTimeSchema.nullable().optional(),
  remindedBy: z.string().nullable().optional(),
  /** Teléfono a usar para avisar: el del paciente o, si no tiene, el del representante. */
  contactPhone: z.string().nullable().optional(),
  contactNote: z.string().nullable().optional(),
});
export type AppointmentView = z.infer<typeof AppointmentViewSchema>;

/** Lo único que ve quien abre el enlace del paciente: sin cédula, sin teléfono, sin datos médicos. */
export const PublicAppointmentViewSchema = z.object({
  code: z.string(),
  status: AppointmentStatusSchema,
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  patientFirstName: z.string(),
  doctorName: z.string(),
  specialty: z.string(),
  clinic: z.object({ name: z.string(), address: z.string().nullable(), phone: z.string().nullable() }),
  /** Se puede cancelar desde el enlace hasta CANCEL_LINK_HOURS horas antes. */
  canCancel: z.boolean(),
  cancelDeadline: IsoDateTimeSchema,
});
export type PublicAppointmentView = z.infer<typeof PublicAppointmentViewSchema>;

export const CANCEL_LINK_HOURS = 2;

export const PublicCancelSchema = z.object({
  /** Confirmación explícita: evita que un previsualizador de enlaces (WhatsApp) cancele solo. */
  confirm: z.literal(true, { errorMap: () => ({ message: 'Confirme que desea cancelar.' }) }),
});
export type PublicCancelInput = z.infer<typeof PublicCancelSchema>;

export const ReminderQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.'),
  clinicId: z.string().uuid().optional(),
});
export type ReminderQuery = z.infer<typeof ReminderQuerySchema>;

export const AppointmentEventViewSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  at: IsoDateTimeSchema,
  by: z.string().nullable(),
  summary: z.string(),
});
export type AppointmentEventView = z.infer<typeof AppointmentEventViewSchema>;

/** Cita futura que quedó fuera del horario (del médico o de la clínica) y hay que reprogramar. */
export const OrphanAppointmentSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  startsAt: IsoDateTimeSchema,
  patientName: z.string(),
  patientPhone: z.string().nullable(),
  clinicName: z.string(),
  doctorName: z.string(),
});
export type OrphanAppointment = z.infer<typeof OrphanAppointmentSchema>;
