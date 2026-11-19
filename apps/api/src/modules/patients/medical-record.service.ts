import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  CONSULTATION_EDIT_HOURS,
  ErrorCodes,
  MEDICAL_HISTORY_FIELDS,
  ageOn,
  bodyMassIndex,
  cie10Label,
  todayIn,
  type AttachmentUpload,
  type BloodType,
  type ConsultationCreate,
  type ConsultationUpdate,
  type ConsultationView,
  type MedicalAttachmentView,
  type MedicalHistory,
  type MedicalRecordView,
  type PortalMedicalRecord,
  type PrescriptionItem,
  type SessionUser,
} from '@clinagenda/schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import { appointmentCode, patientCode } from '../../common/utils/views';
import { prescriptionPdf } from '../../common/utils/prescription-pdf';
import type { RequestMeta } from '../../common/decorators/auth.decorators';
import { PatientsService } from './patients.service';

const consultationInclude = {
  doctor: true,
  author: { select: { fullName: true } },
  appointment: { select: { id: true, code: true, startsAt: true, clinic: { select: { name: true } } } },
} satisfies Prisma.ConsultationInclude;

/** Todo menos el contenido del archivo: las listas nunca cargan los bytes. */
const attachmentSelect = {
  id: true,
  patientId: true,
  consultationId: true,
  filename: true,
  mime: true,
  bytes: true,
  description: true,
  sharedWithPatient: true,
  uploadedById: true,
  createdAt: true,
  uploadedBy: { select: { fullName: true } },
} satisfies Prisma.MedicalAttachmentSelect;
type AttachmentRow = Prisma.MedicalAttachmentGetPayload<{ select: typeof attachmentSelect }>;
type ConsultationRow = Prisma.ConsultationGetPayload<{ include: typeof consultationInclude }>;

const HISTORY_KEYS = ['bloodType', ...MEDICAL_HISTORY_FIELDS.map((f) => f.key)] as const;
const EDIT_MS = CONSULTATION_EDIT_HOURS * 3600_000;

/** Quien la escribió puede corregirla durante las primeras horas; después se agrega otra consulta. */
function isEditable(c: { authorId: string; createdAt: Date }, user: SessionUser) {
  return c.authorId === user.id && Date.now() - c.createdAt.getTime() < EDIT_MS;
}

function toConsultationView(c: ConsultationRow, user: SessionUser): ConsultationView {
  return {
    id: c.id,
    appointment: c.appointment ? { id: c.appointment.id, code: appointmentCode(c.appointment.code), startsAt: c.appointment.startsAt.toISOString(), clinic: c.appointment.clinic.name } : null,
    doctor: { id: c.doctor.id, fullName: c.doctor.fullName, specialty: c.doctor.specialty },
    author: c.author.fullName,
    reason: c.reason,
    weightKg: c.weightKg,
    heightCm: c.heightCm,
    bmi: bodyMassIndex(c.weightKg, c.heightCm),
    systolic: c.systolic,
    diastolic: c.diastolic,
    heartRate: c.heartRate,
    temperatureC: c.temperatureC,
    oxygenSat: c.oxygenSat,
    findings: c.findings,
    diagnosis: c.diagnosis,
    diagnosisCode: c.diagnosisCode,
    diagnosisCodeLabel: cie10Label(c.diagnosisCode),
    plan: c.plan,
    prescription: c.prescription as unknown as PrescriptionItem[],
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    editable: isEditable(c, user),
  };
}

function toAttachmentView(a: AttachmentRow, user: SessionUser): MedicalAttachmentView {
  return {
    id: a.id,
    filename: a.filename,
    mime: a.mime,
    bytes: a.bytes,
    description: a.description,
    sharedWithPatient: a.sharedWithPatient,
    consultationId: a.consultationId,
    uploadedBy: a.uploadedBy.fullName,
    createdAt: a.createdAt.toISOString(),
    deletable: isEditable({ authorId: a.uploadedById, createdAt: a.createdAt }, user),
  };
}

/** Los campos que cambiaron, para la bitácora: el contenido clínico no se copia ahí. */
function changedFields(before: object | null, after: object, keys: readonly string[]) {
  const was = (before ?? {}) as Record<string, unknown>;
  const now = after as Record<string, unknown>;
  return keys.filter((k) => JSON.stringify(was[k] ?? null) !== JSON.stringify(now[k] ?? null));
}

/**
 * El tipo real del archivo, mirando sus primeros bytes (no la extensión ni lo que dice el navegador):
 * así nadie sube un ejecutable renombrado a .pdf.
 */
export function sniffMime(buf: Buffer): keyof typeof ATTACHMENT_TYPES | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Nombre seguro para guardar y descargar: sin rutas, sin caracteres raros, con la extensión del tipo real. */
function safeFilename(original: string, mime: keyof typeof ATTACHMENT_TYPES) {
  const ext = ATTACHMENT_TYPES[mime].toLowerCase();
  const base = (original.split(/[\\/]/).pop() ?? '')
    .normalize('NFC')
    .replace(/\.[^.]*$/, '')
    .replace(/[^\p{L}\p{N} ._()-]+/gu, '')
    .trim()
    .slice(0, 100);
  return `${base || 'archivo'}.${ext}`;
}

/**
 * Ficha médica del paciente. Las reglas de acceso van aquí y no solo en la web:
 * - recepción no la ve nunca (aunque un rol de recepción tenga el permiso de escribir);
 * - un médico, solo la de pacientes que tienen o tuvieron cita con él;
 * - escribir pide el permiso fichas.editar; las consultas, además, estar vinculado a una ficha de médico.
 */
@Injectable()
export class MedicalRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly patients: PatientsService,
  ) {}

  /** Cada lectura de una ficha con contenido queda en la bitácora, igual que las notas clínicas de las citas. */
  async get(patientId: string, user: SessionUser, { logView = true } = {}): Promise<MedicalRecordView> {
    const patient = await this.assertCanRead(patientId, user);
    const [record, consultations, attachments] = await Promise.all([
      this.prisma.medicalRecord.findUnique({ where: { patientId }, include: { updatedBy: { select: { fullName: true } } } }),
      this.prisma.consultation.findMany({ where: { patientId }, include: consultationInclude, orderBy: { createdAt: 'desc' } }),
      this.prisma.medicalAttachment.findMany({ where: { patientId }, select: attachmentSelect, orderBy: { createdAt: 'desc' } }),
    ]);
    if (logView && (record || consultations.length || attachments.length)) {
      await this.audit.log({ userId: user.id, action: 'VIEW_CLINICAL', entity: 'MedicalRecord', entityId: patientId, summary: `Consultó la ficha médica de ${patientCode(patient.code)}` });
    }
    const canEditHistory = user.permissions.includes('fichas.editar');
    return {
      patientId,
      history: {
        bloodType: (record?.bloodType ?? null) as BloodType | null,
        allergies: record?.allergies ?? null,
        chronicConditions: record?.chronicConditions ?? null,
        medications: record?.medications ?? null,
        surgicalHistory: record?.surgicalHistory ?? null,
        familyHistory: record?.familyHistory ?? null,
        habits: record?.habits ?? null,
        notes: record?.notes ?? null,
        updatedAt: record?.updatedAt.toISOString() ?? null,
        updatedBy: record?.updatedBy?.fullName ?? null,
      },
      consultations: consultations.map((c) => toConsultationView(c, user)),
      attachments: attachments.map((a) => toAttachmentView(a, user)),
      canEditHistory,
      canWriteConsultation: canEditHistory && !!user.doctorId,
    };
  }

  async saveHistory(patientId: string, input: MedicalHistory, user: SessionUser, meta: RequestMeta): Promise<MedicalRecordView> {
    const patient = await this.assertCanWrite(patientId, user);
    const before = await this.prisma.medicalRecord.findUnique({ where: { patientId } });
    const changed = changedFields(before, input, HISTORY_KEYS);
    if (changed.length) {
      await this.prisma.$transaction(async (tx) => {
        await tx.medicalRecord.upsert({ where: { patientId }, create: { patientId, ...input, updatedById: user.id }, update: { ...input, updatedById: user.id } });
        await this.audit.log(
          {
            userId: user.id,
            action: before ? 'UPDATE' : 'CREATE',
            entity: 'MedicalRecord',
            entityId: patientId,
            summary: `Actualizó los antecedentes de la ficha médica de ${patientCode(patient.code)}`,
            after: { campos: changed },
            meta,
          },
          tx,
        );
      });
    }
    return this.get(patientId, user, { logView: false });
  }

  async addConsultation(patientId: string, input: ConsultationCreate, user: SessionUser, meta: RequestMeta): Promise<ConsultationView> {
    const patient = await this.assertCanWrite(patientId, user);
    if (!user.doctorId) throw DomainError.forbidden('Para registrar consultas su usuario debe estar vinculado a una ficha de médico. Pídalo a la dirección.');
    if (input.appointmentId) await this.assertAppointmentFits(input.appointmentId, patientId, user.doctorId);

    const { appointmentId, ...data } = input;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const c = await tx.consultation.create({
          data: { ...data, prescription: data.prescription as Prisma.InputJsonValue, patientId, appointmentId, doctorId: user.doctorId!, authorId: user.id },
          include: consultationInclude,
        });
        await this.audit.log(
          {
            userId: user.id,
            action: 'CREATE',
            entity: 'Consultation',
            entityId: c.id,
            summary: `Registró una consulta en la ficha médica de ${patientCode(patient.code)}${c.appointment ? ` (cita ${appointmentCode(c.appointment.code)})` : ''}`,
            meta,
          },
          tx,
        );
        return toConsultationView(c, user);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw DomainError.conflict(ErrorCodes.CONFLICT, 'Esa cita ya tiene su consulta registrada. Corríjala desde la ficha o elija "sin cita".', { appointmentId: 'Esta cita ya tiene consulta.' });
      }
      throw e;
    }
  }

  async updateConsultation(patientId: string, id: string, input: ConsultationUpdate, user: SessionUser, meta: RequestMeta): Promise<ConsultationView> {
    const patient = await this.assertCanWrite(patientId, user);
    const before = await this.prisma.consultation.findUnique({ where: { id } });
    if (!before || before.patientId !== patientId) throw DomainError.notFound('la consulta');
    if (before.authorId !== user.id) throw DomainError.forbidden('Solo quien escribió la consulta puede corregirla. Si falta algo, registre una consulta nueva.');
    if (!isEditable(before, user)) {
      throw DomainError.validation(`Pasadas ${CONSULTATION_EDIT_HOURS} horas una consulta ya no se cambia, para que la ficha sea confiable. Registre una consulta nueva con la corrección.`);
    }
    const changed = changedFields(before, input, Object.keys(input));
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.consultation.update({ where: { id }, data: { ...input, prescription: input.prescription as Prisma.InputJsonValue }, include: consultationInclude });
      if (changed.length) {
        await this.audit.log(
          {
            userId: user.id,
            action: 'UPDATE',
            entity: 'Consultation',
            entityId: id,
            summary: `Corrigió una consulta en la ficha médica de ${patientCode(patient.code)}`,
            after: { campos: changed },
            meta,
          },
          tx,
        );
      }
      return toConsultationView(c, user);
    });
  }

  /** Receta de una consulta en PDF, para imprimir o enviar. Queda en la bitácora. */
  async prescription(patientId: string, consultationId: string, user: SessionUser, meta: RequestMeta) {
    const patient = await this.assertCanRead(patientId, user);
    const out = await this.renderPrescription(patientId, consultationId);
    await this.audit.log({ userId: user.id, action: 'PRINT', entity: 'Consultation', entityId: consultationId, summary: `Descargó la receta ${out.code} de ${patientCode(patient.code)}`, meta });
    return out;
  }

  async addAttachment(patientId: string, file: Express.Multer.File | undefined, input: AttachmentUpload, user: SessionUser, meta: RequestMeta): Promise<MedicalAttachmentView> {
    const patient = await this.assertCanWrite(patientId, user);
    if (!file?.buffer?.length) throw DomainError.validation('Elija un archivo.', { file: 'Elija un archivo.' });
    if (file.size > ATTACHMENT_MAX_BYTES) throw DomainError.validation('El archivo pasa de 10 MB. Redúzcalo o escanéelo en menor calidad.', { file: 'Máximo 10 MB.' });
    const mime = sniffMime(file.buffer);
    if (!mime) throw DomainError.validation('Solo se aceptan PDF y fotos (JPG, PNG o WEBP).', { file: 'Tipo de archivo no permitido.' });
    if (input.consultationId) {
      const c = await this.prisma.consultation.findUnique({ where: { id: input.consultationId } });
      if (!c || c.patientId !== patientId) throw DomainError.validation('Esa consulta no es de este paciente.', { consultationId: 'Elija una consulta de este paciente.' });
    }
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.medicalAttachment.create({
        data: { patientId, consultationId: input.consultationId, filename: safeFilename(file.originalname, mime), mime, bytes: file.size, data: new Uint8Array(file.buffer), description: input.description, sharedWithPatient: input.sharedWithPatient, uploadedById: user.id },
        select: attachmentSelect,
      });
      await this.audit.log(
        { userId: user.id, action: 'CREATE', entity: 'MedicalAttachment', entityId: a.id, summary: `Adjuntó un archivo (${ATTACHMENT_TYPES[mime]}) a la ficha médica de ${patientCode(patient.code)}`, meta },
        tx,
      );
      return toAttachmentView(a, user);
    });
  }

  /** El archivo, para verlo o descargarlo. Cada apertura queda en la bitácora. */
  async attachmentFile(patientId: string, id: string, user: SessionUser, meta: RequestMeta) {
    const patient = await this.assertCanRead(patientId, user);
    const a = await this.prisma.medicalAttachment.findUnique({ where: { id } });
    if (!a || a.patientId !== patientId) throw DomainError.notFound('el archivo');
    await this.audit.log({ userId: user.id, action: 'VIEW_CLINICAL', entity: 'MedicalAttachment', entityId: id, summary: `Abrió un archivo de la ficha médica de ${patientCode(patient.code)}`, meta });
    return { filename: a.filename, mime: a.mime, data: Buffer.from(a.data) };
  }

  async setAttachmentShared(patientId: string, id: string, shared: boolean, user: SessionUser, meta: RequestMeta): Promise<MedicalAttachmentView> {
    const patient = await this.assertCanWrite(patientId, user);
    const before = await this.prisma.medicalAttachment.findUnique({ where: { id }, select: attachmentSelect });
    if (!before || before.patientId !== patientId) throw DomainError.notFound('el archivo');
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.medicalAttachment.update({ where: { id }, data: { sharedWithPatient: shared }, select: attachmentSelect });
      await this.audit.log(
        { userId: user.id, action: 'UPDATE', entity: 'MedicalAttachment', entityId: id, summary: `${shared ? 'Compartió con el paciente' : 'Dejó de compartir con el paciente'} un archivo de ${patientCode(patient.code)}`, meta },
        tx,
      );
      return toAttachmentView(a, user);
    });
  }

  /** Solo quien lo subió y en las primeras horas: es para corregir un archivo equivocado (de otro paciente, por ejemplo). */
  async removeAttachment(patientId: string, id: string, user: SessionUser, meta: RequestMeta) {
    const patient = await this.assertCanWrite(patientId, user);
    const a = await this.prisma.medicalAttachment.findUnique({ where: { id }, select: attachmentSelect });
    if (!a || a.patientId !== patientId) throw DomainError.notFound('el archivo');
    if (!isEditable({ authorId: a.uploadedById, createdAt: a.createdAt }, user)) {
      throw DomainError.forbidden(`Solo quien subió el archivo puede quitarlo, y durante las primeras ${CONSULTATION_EDIT_HOURS} horas.`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.medicalAttachment.delete({ where: { id } });
      await this.audit.log(
        { userId: user.id, action: 'DELETE', entity: 'MedicalAttachment', entityId: id, summary: `Quitó el archivo "${a.filename}" de la ficha médica de ${patientCode(patient.code)}`, meta },
        tx,
      );
    });
    return { ok: true as const };
  }

  // ----- Portal del paciente: solo su propia ficha, sin notas de examen ni archivos no compartidos -----

  async forPatient(patientId: string): Promise<PortalMedicalRecord> {
    const [record, consultations, attachments] = await Promise.all([
      this.prisma.medicalRecord.findUnique({ where: { patientId } }),
      this.prisma.consultation.findMany({ where: { patientId }, include: consultationInclude, orderBy: { createdAt: 'desc' } }),
      this.prisma.medicalAttachment.findMany({ where: { patientId, sharedWithPatient: true }, select: attachmentSelect, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      history: {
        bloodType: (record?.bloodType ?? null) as BloodType | null,
        allergies: record?.allergies ?? null,
        chronicConditions: record?.chronicConditions ?? null,
        medications: record?.medications ?? null,
      },
      consultations: consultations.map((c) => {
        const { findings: _f, author: _a, editable: _e, updatedAt: _u, ...rest } = toConsultationView(c, { id: '' } as SessionUser);
        return rest;
      }),
      attachments: attachments.map((a) => ({ id: a.id, filename: a.filename, mime: a.mime, bytes: a.bytes, description: a.description, createdAt: a.createdAt.toISOString() })),
    };
  }

  async prescriptionForPatient(patientId: string, consultationId: string) {
    return this.renderPrescription(patientId, consultationId);
  }

  async attachmentForPatient(patientId: string, id: string) {
    const a = await this.prisma.medicalAttachment.findFirst({ where: { id, patientId, sharedWithPatient: true } });
    if (!a) throw DomainError.notFound('el archivo');
    return { filename: a.filename, mime: a.mime, data: Buffer.from(a.data) };
  }

  private async renderPrescription(patientId: string, consultationId: string) {
    const c = await this.prisma.consultation.findUnique({ where: { id: consultationId }, include: { patient: { include: { medicalRecord: true } }, doctor: true, appointment: { include: { clinic: true } } } });
    if (!c || c.patientId !== patientId) throw DomainError.notFound('la consulta');
    const items = c.prescription as unknown as PrescriptionItem[];
    if (!items.length) throw DomainError.validation('Esta consulta no tiene receta.');
    const p = c.patient;
    const code = `R-${c.id.slice(0, 8).toUpperCase()}`;
    const clinic = c.appointment?.clinic ?? null;
    const pdf = await prescriptionPdf({
      code,
      date: c.appointment?.startsAt ?? c.createdAt,
      timezone: clinic?.timezone ?? 'America/Guayaquil',
      patient: { name: `${p.firstNames} ${p.lastNames}`, age: ageOn(p.birthDate.toISOString().slice(0, 10), todayIn()), document: p.documentNumber },
      doctor: { name: c.doctor.fullName, specialty: c.doctor.specialty },
      clinic: clinic && { name: clinic.name, address: clinic.address, phone: clinic.phone },
      allergies: p.medicalRecord?.allergies ?? null,
      diagnosis: c.diagnosis,
      diagnosisCode: c.diagnosisCode,
      items,
      instructions: c.plan,
    });
    return { code, filename: `receta-${code}.pdf`, pdf };
  }

  private async assertCanRead(patientId: string, user: SessionUser) {
    if (user.role === 'RECEPCION') throw DomainError.forbidden('La ficha médica solo la ven los médicos y la dirección.');
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw DomainError.notFound('al paciente');
    await this.patients.assertCanSee(patientId, user);
    return patient;
  }

  private async assertCanWrite(patientId: string, user: SessionUser) {
    const patient = await this.assertCanRead(patientId, user);
    if (patient.mergedIntoId) throw DomainError.validation('Este registro fue unido a otro paciente; escriba en la ficha del paciente principal.');
    return patient;
  }

  /** La cita debe ser de este paciente, del médico que escribe, no cancelada y ya llegada (o por empezar). */
  private async assertAppointmentFits(appointmentId: string, patientId: string, doctorId: string) {
    const appt = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt || appt.patientId !== patientId) throw DomainError.validation('Esa cita no es de este paciente.', { appointmentId: 'Elija una cita de este paciente.' });
    if (appt.doctorId !== doctorId) throw DomainError.validation('Solo puede registrar la consulta de sus propias citas.', { appointmentId: 'Esta cita es de otro médico.' });
    if (appt.status === 'CANCELLED' || appt.status === 'REQUESTED') {
      throw DomainError.validation('Esa cita no se atendió (está cancelada o sin confirmar).', { appointmentId: 'Elija una cita atendida.' });
    }
    if (appt.startsAt.getTime() > Date.now() + 60 * 60_000) throw DomainError.validation('Esa cita todavía no llega.', { appointmentId: 'Elija una cita de hoy o anterior.' });
  }
}
