import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CONSULTATION_EDIT_HOURS,
  ErrorCodes,
  MEDICAL_HISTORY_FIELDS,
  bodyMassIndex,
  type BloodType,
  type ConsultationCreate,
  type ConsultationUpdate,
  type ConsultationView,
  type MedicalHistory,
  type MedicalRecordView,
  type SessionUser,
} from '@clinagenda/schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import { appointmentCode, patientCode } from '../../common/utils/views';
import type { RequestMeta } from '../../common/decorators/auth.decorators';
import { PatientsService } from './patients.service';

const consultationInclude = {
  doctor: true,
  author: { select: { fullName: true } },
  appointment: { select: { id: true, code: true, startsAt: true, clinic: { select: { name: true } } } },
} satisfies Prisma.ConsultationInclude;
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
    plan: c.plan,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    editable: isEditable(c, user),
  };
}

/** Los campos que cambiaron, para la bitácora: el contenido clínico no se copia ahí. */
function changedFields(before: object | null, after: object, keys: readonly string[]) {
  const was = (before ?? {}) as Record<string, unknown>;
  const now = after as Record<string, unknown>;
  return keys.filter((k) => (was[k] ?? null) !== (now[k] ?? null));
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
    const [record, consultations] = await Promise.all([
      this.prisma.medicalRecord.findUnique({ where: { patientId }, include: { updatedBy: { select: { fullName: true } } } }),
      this.prisma.consultation.findMany({ where: { patientId }, include: consultationInclude, orderBy: { createdAt: 'desc' } }),
    ]);
    if (logView && (record || consultations.length)) {
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
        const c = await tx.consultation.create({ data: { ...data, patientId, appointmentId, doctorId: user.doctorId!, authorId: user.id }, include: consultationInclude });
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
      const c = await tx.consultation.update({ where: { id }, data: input, include: consultationInclude });
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
