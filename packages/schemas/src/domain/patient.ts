import { z } from 'zod';
import { DocumentTypeSchema, SexSchema } from './enums';
import { cleaned, optionalCleanString } from './common';
import { CEDULA_ERROR_MESSAGES, checkCedula, normalizeCedula } from '../validators/cedula';
import { checkPhone } from '../validators/phone';
import { PERSON_NAME_PATTERN, toTitleCaseName } from '../validators/text';
import { MAX_AGE_YEARS, ageOn, isRealIsoDate, todayIn } from '../validators/dates';

export const ADULT_AGE = 18;

const nameField = (label: string) =>
  cleaned(
    toTitleCaseName,
    z
      .string({ required_error: `Escriba ${label}.`, invalid_type_error: `Escriba ${label}.` })
      .min(2, `Escriba ${label}.`)
      .max(80, `${label} no puede pasar de 80 letras.`)
      .regex(PERSON_NAME_PATTERN, `${label[0].toUpperCase()}${label.slice(1)} solo puede tener letras, espacios, guion o apóstrofe (sin números ni símbolos).`),
  );

/** Teléfono opcional: vacío -> null; con contenido -> E.164 o error explicativo. */
export const OptionalPhoneSchema = z
  .string()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v || !v.trim()) return null;
    const r = checkPhone(v);
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: r.message });
      return z.NEVER;
    }
    return r.e164;
  });

export const OptionalEmailSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() || null : (v ?? null)),
  z
    .string()
    .max(120)
    .regex(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i, 'El correo no parece válido. Debe verse así: nombre@dominio.com (una sola @, sin espacios).')
    .nullable(),
);

export const BirthDateSchema = z
  .string({ required_error: 'Escriba la fecha de nacimiento.' })
  .refine(isRealIsoDate, 'Esa fecha no existe. Revise día, mes y año.')
  .refine((v) => v <= todayIn(), 'La fecha de nacimiento no puede ser en el futuro.')
  .refine((v) => ageOn(v, todayIn()) <= MAX_AGE_YEARS, `Con esa fecha el paciente tendría más de ${MAX_AGE_YEARS} años. Revise el año.`);

export const GuardianSchema = z.object({
  fullName: nameField('el nombre del representante'),
  relationship: cleaned((v) => v.trim(), z.string().min(3, 'Indique el parentesco (madre, padre, hijo, cuidador…).').max(40)),
  phone: OptionalPhoneSchema,
  documentNumber: optionalCleanString(20, 'El documento del representante'),
});
export type GuardianInput = z.infer<typeof GuardianSchema>;

const PatientBaseSchema = z.object({
  firstNames: nameField('los nombres'),
  lastNames: nameField('los apellidos'),
  birthDate: BirthDateSchema,
  /** Para adultos mayores que no recuerdan la fecha exacta: se guarda una aproximada y queda marcada. */
  birthDateEstimated: z.boolean().default(false),
  sex: SexSchema.optional().nullable(),
  documentType: DocumentTypeSchema,
  documentNumber: z.string().optional().nullable(),
  noDocumentReason: optionalCleanString(200, 'El motivo'),
  phone: OptionalPhoneSchema,
  email: OptionalEmailSchema,
  address: optionalCleanString(200, 'La dirección'),
  /** Cómo ubicar al paciente cuando no tiene teléfono ni correo ("avisar a la vecina, Sra. Mora, 099…"). */
  contactNote: optionalCleanString(300, 'La nota de contacto'),
  guardian: GuardianSchema.optional().nullable(),
  /** El usuario confirmó que NO es un duplicado de un paciente parecido que el sistema le mostró. */
  confirmNotDuplicate: z.boolean().default(false),
});

type PatientBase = z.infer<typeof PatientBaseSchema>;

function refinePatient(v: Partial<PatientBase>, ctx: z.RefinementCtx, partial: boolean) {
  // Documento según su tipo
  if (v.documentType === 'CEDULA') {
    const raw = v.documentNumber ?? '';
    const err = checkCedula(raw);
    if (err) ctx.addIssue({ code: 'custom', path: ['documentNumber'], message: raw ? CEDULA_ERROR_MESSAGES[err] : 'Escriba el número de cédula.' });
  } else if (v.documentType === 'PASAPORTE') {
    const raw = (v.documentNumber ?? '').replace(/\s/g, '').toUpperCase();
    if (!/^[A-Z0-9]{5,20}$/.test(raw)) {
      ctx.addIssue({ code: 'custom', path: ['documentNumber'], message: 'El pasaporte debe tener entre 5 y 20 letras o números, sin espacios ni símbolos.' });
    }
  } else if (v.documentType === 'SIN_DOCUMENTO' && !v.noDocumentReason) {
    ctx.addIssue({
      code: 'custom',
      path: ['noDocumentReason'],
      message: 'Indique por qué no tiene documento (ej. "recién nacido, aún sin cédula").',
    });
  }

  if (partial && !v.birthDate) return;
  const birthOk = !!v.birthDate && isRealIsoDate(v.birthDate) && v.birthDate <= todayIn();
  const isMinor = birthOk ? ageOn(v.birthDate!, todayIn()) < ADULT_AGE : false;
  if (isMinor && !v.guardian) {
    ctx.addIssue({ code: 'custom', path: ['guardian'], message: 'El paciente es menor de edad: registre a su madre, padre o representante.' });
  }

  // Que siempre haya una forma de avisarle al paciente si su cita cambia.
  const hasContact = Boolean(v.phone || v.email || v.guardian?.phone || v.contactNote);
  if (!hasContact) {
    ctx.addIssue({
      code: 'custom',
      path: ['contactNote'],
      message: 'El paciente no tiene teléfono ni correo. Escriba cómo ubicarlo si hay que cambiar su cita (ej. un familiar o vecino).',
    });
  }
}

function normalizeDocument<T extends Partial<PatientBase>>(v: T): T {
  if (v.documentType === 'CEDULA' && v.documentNumber) return { ...v, documentNumber: normalizeCedula(v.documentNumber) };
  if (v.documentType === 'PASAPORTE' && v.documentNumber) return { ...v, documentNumber: v.documentNumber.replace(/\s/g, '').toUpperCase() };
  if (v.documentType === 'SIN_DOCUMENTO') return { ...v, documentNumber: null };
  return v;
}

export const PatientCreateSchema = PatientBaseSchema.superRefine((v, ctx) => refinePatient(v, ctx, false)).transform(normalizeDocument);
export type PatientCreateInput = z.input<typeof PatientCreateSchema>;
export type PatientCreate = z.output<typeof PatientCreateSchema>;

/** Edición: se envía la ficha completa para revalidar todas las reglas juntas. */
export const PatientUpdateSchema = PatientCreateSchema;
export type PatientUpdate = z.output<typeof PatientUpdateSchema>;

export const PatientSearchQuerySchema = z.object({
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['lastNames', 'firstNames', 'birthDate', 'createdAt']).default('lastNames'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type PatientSearchQuery = z.infer<typeof PatientSearchQuerySchema>;

export const DuplicateCheckSchema = z.object({
  firstNames: z.string().max(80),
  lastNames: z.string().max(80),
  birthDate: z.string().optional().nullable(),
  documentNumber: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});
export type DuplicateCheckInput = z.infer<typeof DuplicateCheckSchema>;

export const MergePatientsSchema = z.object({
  keepId: z.string().uuid(),
  mergeId: z.string().uuid(),
});
export type MergePatientsInput = z.infer<typeof MergePatientsSchema>;

export interface PatientView {
  id: string;
  code: string;
  firstNames: string;
  lastNames: string;
  fullName: string;
  birthDate: string;
  birthDateEstimated: boolean;
  age: number;
  sex: 'F' | 'M' | 'X' | null;
  documentType: z.infer<typeof DocumentTypeSchema>;
  documentNumber: string | null;
  noDocumentReason: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contactNote: string | null;
  guardian: GuardianInput | null;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateCandidate {
  patient: PatientView;
  score: number;
  reasons: string[];
}
