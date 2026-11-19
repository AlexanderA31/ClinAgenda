import { z } from 'zod';
import { IsoDateTimeSchema, cleaned } from './common';
import { cleanMultiline, cleanText } from '../validators/text';
import { CIE10_PATTERN, normalizeCie10 } from './cie10';

/**
 * Ficha médica: una por paciente y compartida por todos los médicos que lo atienden.
 * Tiene dos partes: los antecedentes (cambian poco y se corrigen) y las consultas (una por atención,
 * no se borran; su autor puede corregirlas durante CONSULTATION_EDIT_HOURS).
 * La ven la dirección y los médicos del paciente; recepción nunca, aunque su rol tenga el permiso.
 */
export const CONSULTATION_EDIT_HOURS = 24;

export const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;
export const BloodTypeSchema = z.enum(BLOOD_TYPES, { errorMap: () => ({ message: 'Elija un grupo sanguíneo de la lista.' }) });
export type BloodType = z.infer<typeof BloodTypeSchema>;

/** Texto clínico con renglones: vacío -> null. */
const clinicalText = (max: number, label: string) =>
  z.preprocess((v) => (v == null ? null : typeof v === 'string' ? cleanMultiline(v) || null : v), z.string().max(max, `${label} no puede pasar de ${max} caracteres.`).nullable());

export const MEDICAL_HISTORY_FIELDS = [
  { key: 'allergies', label: 'Alergias', hint: 'Medicamentos, alimentos u otras. Si no tiene, escriba "Ninguna conocida".' },
  { key: 'chronicConditions', label: 'Enfermedades crónicas', hint: 'Hipertensión, diabetes, asma…' },
  { key: 'medications', label: 'Medicación habitual', hint: 'Nombre, dosis y frecuencia.' },
  { key: 'surgicalHistory', label: 'Cirugías y hospitalizaciones', hint: 'Qué y en qué año.' },
  { key: 'familyHistory', label: 'Antecedentes familiares', hint: 'Enfermedades de padres, hermanos o abuelos.' },
  { key: 'habits', label: 'Hábitos', hint: 'Tabaco, alcohol, actividad física, alimentación.' },
  { key: 'notes', label: 'Otras observaciones', hint: 'Embarazos, vacunas, discapacidad u otro dato útil.' },
] as const;
export type MedicalHistoryField = (typeof MEDICAL_HISTORY_FIELDS)[number]['key'];

export const MedicalHistorySchema = z.object({
  bloodType: BloodTypeSchema.nullable().default(null),
  allergies: clinicalText(2000, 'Las alergias'),
  chronicConditions: clinicalText(2000, 'Las enfermedades crónicas'),
  medications: clinicalText(2000, 'La medicación'),
  surgicalHistory: clinicalText(2000, 'Las cirugías'),
  familyHistory: clinicalText(2000, 'Los antecedentes familiares'),
  habits: clinicalText(2000, 'Los hábitos'),
  notes: clinicalText(2000, 'Las observaciones'),
});
export type MedicalHistoryInput = z.input<typeof MedicalHistorySchema>;
export type MedicalHistory = z.output<typeof MedicalHistorySchema>;

/** Medida opcional: acepta "70,5" o 70.5; vacío -> null. Los rangos atrapan errores de tipeo (700 kg, 3.65 °C), no casos clínicos raros. */
const measure = (label: string, unit: string, min: number, max: number, { integer = false } = {}) => {
  const range = `${label} debe estar entre ${String(min).replace('.', ',')} y ${max} ${unit}.`;
  return z.preprocess(
    (v) => (v == null || v === '' ? null : typeof v === 'string' ? Number(v.replace(',', '.').trim()) : v),
    z
      .number({ invalid_type_error: `${label}: escriba solo el número.` })
      .min(min, range)
      .max(max, range)
      .refine((n) => !integer || Number.isInteger(n), `${label} va sin decimales.`)
      .transform((n) => Math.round(n * 10) / 10)
      .nullable(),
  );
};

export const VitalsSchema = z.object({
  weightKg: measure('El peso', 'kg', 0.3, 400),
  heightCm: measure('La talla', 'cm', 30, 250),
  systolic: measure('La presión sistólica', 'mmHg', 50, 260, { integer: true }),
  diastolic: measure('La presión diastólica', 'mmHg', 30, 160, { integer: true }),
  heartRate: measure('La frecuencia cardiaca', 'lpm', 20, 250, { integer: true }),
  temperatureC: measure('La temperatura', '°C', 30, 45),
  oxygenSat: measure('La saturación', '%', 50, 100, { integer: true }),
});
export type Vitals = z.output<typeof VitalsSchema>;

function refineVitals(v: Partial<Vitals>, ctx: z.RefinementCtx) {
  if ((v.systolic == null) !== (v.diastolic == null)) {
    ctx.addIssue({ code: 'custom', path: [v.systolic == null ? 'systolic' : 'diastolic'], message: 'Escriba las dos cifras de la presión (ej. 120 / 80).' });
  } else if (v.systolic != null && v.diastolic != null && v.systolic <= v.diastolic) {
    ctx.addIssue({ code: 'custom', path: ['diastolic'], message: 'La diastólica debe ser menor que la sistólica. ¿Se invirtieron?' });
  }
}

/** Texto corto de una línea: vacío -> null. */
const shortText = (max: number, label: string) =>
  z.preprocess((v) => (v == null ? null : typeof v === 'string' ? cleanText(v) || null : v), z.string().max(max, `${label} no puede pasar de ${max} caracteres.`).nullable());

/** Un medicamento de la receta. Solo el nombre es obligatorio; lo demás se imprime si está. */
export const PrescriptionItemSchema = z.object({
  medication: cleaned(cleanText, z.string({ required_error: 'Escriba el medicamento.' }).min(2, 'Escriba el medicamento.').max(120, 'El medicamento no puede pasar de 120 caracteres.')),
  dose: shortText(60, 'La dosis'),
  frequency: shortText(80, 'La frecuencia'),
  duration: shortText(60, 'La duración'),
  instructions: shortText(200, 'La indicación'),
});
export type PrescriptionItem = z.output<typeof PrescriptionItemSchema>;
export const MAX_PRESCRIPTION_ITEMS = 15;

const ConsultationBaseSchema = VitalsSchema.extend({
  reason: cleaned(cleanText, z.string({ required_error: 'Escriba el motivo de consulta.' }).min(3, 'Escriba el motivo de consulta.').max(300, 'El motivo no puede pasar de 300 caracteres.')),
  findings: clinicalText(4000, 'El examen y la evolución'),
  diagnosis: clinicalText(1000, 'El diagnóstico'),
  /** Código CIE-10 (OMS). Se acepta cualquiera bien escrito; la lista frecuente está en cie10.ts. */
  diagnosisCode: z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() ? normalizeCie10(v) : null) : (v ?? null)),
    z.string().regex(CIE10_PATTERN, 'El código CIE-10 se escribe como una letra y dos números, con decimal opcional: J06.9, I10.').nullable(),
  ),
  plan: clinicalText(4000, 'El plan'),
  prescription: z.array(PrescriptionItemSchema).max(MAX_PRESCRIPTION_ITEMS, `Una receta lleva como máximo ${MAX_PRESCRIPTION_ITEMS} medicamentos.`).default([]),
});

export const ConsultationCreateSchema = ConsultationBaseSchema.extend({
  /** La cita en la que se atendió, si la hubo. Debe ser del mismo paciente y del médico que escribe. */
  appointmentId: z.string().uuid().nullable().default(null),
}).superRefine(refineVitals);
export type ConsultationCreateInput = z.input<typeof ConsultationCreateSchema>;
export type ConsultationCreate = z.output<typeof ConsultationCreateSchema>;

export const ConsultationUpdateSchema = ConsultationBaseSchema.superRefine(refineVitals);
export type ConsultationUpdate = z.output<typeof ConsultationUpdateSchema>;

/** Índice de masa corporal con un decimal, o null si falta peso o talla. */
export function bodyMassIndex(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
}

export const MedicalHistoryViewSchema = z.object({
  bloodType: BloodTypeSchema.nullable(),
  allergies: z.string().nullable(),
  chronicConditions: z.string().nullable(),
  medications: z.string().nullable(),
  surgicalHistory: z.string().nullable(),
  familyHistory: z.string().nullable(),
  habits: z.string().nullable(),
  notes: z.string().nullable(),
  updatedAt: IsoDateTimeSchema.nullable(),
  updatedBy: z.string().nullable(),
});
export type MedicalHistoryView = z.infer<typeof MedicalHistoryViewSchema>;

export const ConsultationViewSchema = z.object({
  id: z.string().uuid(),
  appointment: z.object({ id: z.string().uuid(), code: z.string(), startsAt: IsoDateTimeSchema, clinic: z.string() }).nullable(),
  doctor: z.object({ id: z.string().uuid(), fullName: z.string(), specialty: z.string() }),
  author: z.string(),
  reason: z.string(),
  weightKg: z.number().nullable(),
  heightCm: z.number().nullable(),
  bmi: z.number().nullable(),
  systolic: z.number().int().nullable(),
  diastolic: z.number().int().nullable(),
  heartRate: z.number().int().nullable(),
  temperatureC: z.number().nullable(),
  oxygenSat: z.number().int().nullable(),
  findings: z.string().nullable(),
  diagnosis: z.string().nullable(),
  diagnosisCode: z.string().nullable(),
  /** Nombre del código en la lista frecuente, o null si no está en ella. */
  diagnosisCodeLabel: z.string().nullable(),
  plan: z.string().nullable(),
  prescription: z.array(PrescriptionItemSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  /** Quien la escribió puede corregirla durante las primeras horas. */
  editable: z.boolean(),
});
export type ConsultationView = z.infer<typeof ConsultationViewSchema>;

/** Archivos de la ficha: resultados de laboratorio, imágenes, informes de otros médicos. */
export const ATTACHMENT_TYPES = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP' } as const;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export const AttachmentUploadSchema = z.object({
  description: shortText(200, 'La descripción'),
  /** El paciente lo ve en su portal (un resultado, por ejemplo). Por defecto no. */
  sharedWithPatient: z.preprocess((v) => v === true || v === 'true', z.boolean()),
  consultationId: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().default(null)),
});
export type AttachmentUpload = z.output<typeof AttachmentUploadSchema>;

export const AttachmentUpdateSchema = z.object({ sharedWithPatient: z.boolean() });

export const MedicalAttachmentViewSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  mime: z.string(),
  bytes: z.number().int(),
  description: z.string().nullable(),
  sharedWithPatient: z.boolean(),
  consultationId: z.string().uuid().nullable(),
  uploadedBy: z.string(),
  createdAt: IsoDateTimeSchema,
  /** Quien lo subió puede borrarlo durante las primeras horas (archivo equivocado). */
  deletable: z.boolean(),
});
export type MedicalAttachmentView = z.infer<typeof MedicalAttachmentViewSchema>;

export const MedicalRecordViewSchema = z.object({
  patientId: z.string().uuid(),
  history: MedicalHistoryViewSchema,
  /** La más reciente primero. */
  consultations: z.array(ConsultationViewSchema),
  attachments: z.array(MedicalAttachmentViewSchema),
  /** Puede corregir los antecedentes. */
  canEditHistory: z.boolean(),
  /** Puede registrar consultas: además del permiso, necesita estar vinculado a una ficha de médico. */
  canWriteConsultation: z.boolean(),
});
export type MedicalRecordView = z.infer<typeof MedicalRecordViewSchema>;

/**
 * Lo que el paciente ve de su ficha en el portal: alergias, enfermedades, medicación, y de cada consulta
 * el diagnóstico, las indicaciones y la receta. No ve las notas de examen del médico (puede pedir la copia
 * completa en la clínica) ni los archivos que el médico no compartió.
 */
export const PortalConsultationSchema = ConsultationViewSchema.pick({
  id: true,
  appointment: true,
  doctor: true,
  reason: true,
  weightKg: true,
  heightCm: true,
  bmi: true,
  systolic: true,
  diastolic: true,
  heartRate: true,
  temperatureC: true,
  oxygenSat: true,
  diagnosis: true,
  diagnosisCode: true,
  diagnosisCodeLabel: true,
  plan: true,
  prescription: true,
  createdAt: true,
});
export type PortalConsultation = z.infer<typeof PortalConsultationSchema>;

export const PortalMedicalRecordSchema = z.object({
  history: MedicalHistoryViewSchema.pick({ bloodType: true, allergies: true, chronicConditions: true, medications: true }),
  consultations: z.array(PortalConsultationSchema),
  attachments: z.array(MedicalAttachmentViewSchema.pick({ id: true, filename: true, mime: true, bytes: true, description: true, createdAt: true })),
});
export type PortalMedicalRecord = z.infer<typeof PortalMedicalRecordSchema>;
