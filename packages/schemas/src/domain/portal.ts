import { z } from 'zod';
import { PasswordSchema } from './auth';
import { AppointmentStatusSchema } from './enums';
import { ADULT_AGE, BirthDateSchema, OptionalEmailSchema, nameField } from './patient';
import { CEDULA_ERROR_MESSAGES, checkCedula, normalizeCedula } from '../validators/cedula';
import { checkPhone } from '../validators/phone';
import { ageOn, todayIn } from '../validators/dates';
import { IsoDateTimeSchema, IsoDaySchema } from './common';

/**
 * Portal del paciente: cada paciente adulto crea su cuenta con su cédula o pasaporte y agenda solo.
 * Los menores y quienes no tienen documento siguen agendando por teléfono o en la clínica.
 */
export const PORTAL_LIMITS = {
  /** Se agenda con al menos este tiempo de anticipación, para que la clínica pueda organizarse. */
  minHoursAhead: 2,
  /** Hasta cuántos días adelante se ve la agenda. */
  maxDaysAhead: 60,
  /** Citas futuras a la vez por paciente: evita que alguien acapare horarios. */
  maxUpcoming: 2,
} as const;

export const PortalDocumentTypeSchema = z.enum(['CEDULA', 'PASAPORTE'], { errorMap: () => ({ message: 'Elija cédula o pasaporte.' }) });

/** Normaliza y valida el documento: misma regla que en la ficha del paciente. */
function checkDocument(type: 'CEDULA' | 'PASAPORTE', raw: string): { ok: true; value: string } | { ok: false; message: string } {
  if (type === 'CEDULA') {
    const err = checkCedula(raw);
    return err ? { ok: false, message: raw ? CEDULA_ERROR_MESSAGES[err] : 'Escriba su número de cédula.' } : { ok: true, value: normalizeCedula(raw) };
  }
  const value = raw.replace(/\s/g, '').toUpperCase();
  return /^[A-Z0-9]{5,20}$/.test(value) ? { ok: true, value } : { ok: false, message: 'El pasaporte debe tener entre 5 y 20 letras o números, sin espacios.' };
}

const RequiredPhoneSchema = z.string({ required_error: 'Escriba su número de celular.' }).transform((v, ctx) => {
  const r = checkPhone(v ?? '');
  if (!v?.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Escriba su número de celular: por ahí le avisamos si su cita cambia.' });
    return z.NEVER;
  }
  if (!r.ok) {
    ctx.addIssue({ code: 'custom', message: r.message });
    return z.NEVER;
  }
  return r.e164;
});

export const PatientRegisterSchema = z
  .object({
    documentType: PortalDocumentTypeSchema,
    documentNumber: z.string({ required_error: 'Escriba su número de documento.' }),
    firstNames: nameField('sus nombres'),
    lastNames: nameField('sus apellidos'),
    birthDate: BirthDateSchema.refine(
      (v) => ageOn(v, todayIn()) >= ADULT_AGE,
      'Las cuentas en línea son para mayores de edad. Para un niño o adolescente, su madre, padre o representante puede llamar a la clínica.',
    ),
    phone: RequiredPhoneSchema,
    email: OptionalEmailSchema.optional(),
    password: PasswordSchema,
    acceptPrivacy: z.literal(true, { errorMap: () => ({ message: 'Para crear su cuenta debe aceptar el aviso de privacidad.' }) }),
  })
  .superRefine((v, ctx) => {
    const doc = checkDocument(v.documentType, v.documentNumber);
    if (!doc.ok) ctx.addIssue({ code: 'custom', path: ['documentNumber'], message: doc.message });
  })
  .transform((v) => {
    const doc = checkDocument(v.documentType, v.documentNumber);
    return { ...v, documentNumber: doc.ok ? doc.value : v.documentNumber };
  });
export type PatientRegisterInput = z.input<typeof PatientRegisterSchema>;
export type PatientRegister = z.output<typeof PatientRegisterSchema>;

export const PatientLoginSchema = z.object({
  documentNumber: z
    .string({ required_error: 'Escriba su cédula o pasaporte.' })
    .transform((v) => v.replace(/[\s-]/g, '').toUpperCase())
    .pipe(z.string().min(5, 'Escriba su cédula o pasaporte.').max(20)),
  password: z.string({ required_error: 'Escriba su contraseña.' }).min(1, 'Escriba su contraseña.').max(200),
});
export type PatientLoginInput = z.input<typeof PatientLoginSchema>;

export const PortalBookSchema = z.object({
  clinicId: z.string().uuid('Elija una clínica.'),
  doctorId: z.string().uuid('Elija un médico.'),
  startsAt: z.string().datetime({ offset: true, message: 'Elija una hora.' }),
  reason: z.preprocess((v) => (typeof v === 'string' ? v.trim() || null : (v ?? null)), z.string().max(200, 'Máximo 200 caracteres.').nullable()).optional(),
});
export type PortalBookInput = z.infer<typeof PortalBookSchema>;

export const PortalAvailabilityQuerySchema = z.object({ clinicId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), doctorId: z.string().uuid().optional() });

export const PortalMeSchema = z.object({
  firstNames: z.string(),
  lastNames: z.string(),
  documentType: z.enum(['CEDULA', 'PASAPORTE']),
  documentNumber: z.string(),
  birthDate: IsoDaySchema,
  age: z.number().int(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  patientCode: z.string(),
  /** Desde cuándo tiene cuenta en línea y su último ingreso. */
  accountSince: IsoDateTimeSchema,
  lastLoginAt: IsoDateTimeSchema.nullable(),
});
export type PortalMe = z.infer<typeof PortalMeSchema>;

/**
 * Lo que el paciente puede corregir por su cuenta: cómo ubicarlo. El nombre, el documento y la fecha
 * de nacimiento identifican su ficha médica; esos se corrigen en la clínica, con el documento a la vista.
 */
export const PortalProfileUpdateSchema = z.object({
  phone: RequiredPhoneSchema,
  email: OptionalEmailSchema.optional(),
  address: z.preprocess((v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') || null : (v ?? null)), z.string().max(200, 'Máximo 200 caracteres.').nullable()).optional(),
});
export type PortalProfileUpdateInput = z.input<typeof PortalProfileUpdateSchema>;
export type PortalProfileUpdate = z.output<typeof PortalProfileUpdateSchema>;

export const PortalAppointmentSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  status: AppointmentStatusSchema,
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  doctorName: z.string(),
  specialty: z.string(),
  clinic: z.object({ id: z.string().uuid(), name: z.string(), address: z.string().nullable(), phone: z.string().nullable() }),
  reason: z.string().nullable(),
  canCancel: z.boolean(),
  /** Si la clínica no aceptó la solicitud: su explicación ("" si no dejó nota); null en otro caso. */
  rejectedNote: z.string().nullable(),
  /** Enlace del comprobante (/c/…), el mismo que recibe por WhatsApp. */
  link: z.string(),
});
export type PortalAppointment = z.infer<typeof PortalAppointmentSchema>;

export const PortalSlotSchema = z.object({
  doctorId: z.string().uuid(),
  doctorName: z.string(),
  specialty: z.string(),
  startsAt: IsoDateTimeSchema,
  label: z.string(),
});
export type PortalSlot = z.infer<typeof PortalSlotSchema>;
