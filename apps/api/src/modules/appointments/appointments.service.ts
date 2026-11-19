import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  APPOINTMENT_STATUS_LABELS,
  CANCEL_REASON_LABELS,
  ErrorCodes,
  type AppointmentCancelInput,
  type AppointmentCreate,
  type AppointmentEventView,
  type AppointmentListQuery,
  type AppointmentRejectInput,
  type AppointmentRescheduleInput,
  type AppointmentStatusUpdateInput,
  type AppointmentView,
  type ClinicalNoteInput,
  type Paginated,
  type SessionUser,
  workClinics,
  worksAt,
} from '@clinagenda/schemas';
import { Db, PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DomainError } from '../../common/errors/domain-error';
import { DEFAULT_TZ, formatLocal, rangeBoundsUtc } from '../../common/utils/time';
import { receiptPdf } from '../../common/utils/receipt-pdf';
import { AppointmentWithRelations, appointmentCode, canSeeClinicalNote, toAppointmentView } from '../../common/utils/views';
import type { RequestMeta } from '../../common/decorators/auth.decorators';
import { SchedulingService } from './scheduling.service';

const include = { patient: true, doctor: true, clinic: { include: { schedules: true } } } as const;

/** Los avisos del paciente abren su historial de citas en el portal. */
const PATIENT_LINK = '/paciente/historial';
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Tras cancelar, durante cuánto tiempo se ofrece el botón "Deshacer" de forma destacada. */
export const UNDO_WINDOW_MINUTES = 10;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scheduling: SchedulingService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(q: AppointmentListQuery, user: SessionUser): Promise<Paginated<AppointmentView>> {
    // Cada quien ve las citas de sus clínicas; la historia de un paciente se ve completa (su ficha es de todas).
    const mine = q.patientId ? null : workClinics(user);
    if (mine && q.clinicId && !mine.includes(q.clinicId)) throw DomainError.forbidden('Usted no trabaja en esa clínica.');
    const where: Prisma.AppointmentWhereInput = {
      clinicId: q.clinicId ?? (mine ? { in: mine } : undefined),
      doctorId: user.role === 'MEDICO' ? (user.doctorId ?? '00000000-0000-0000-0000-000000000000') : q.doctorId,
      patientId: q.patientId,
      status: q.status,
    };
    if (q.from && q.to) {
      const { start, end } = rangeBoundsUtc(q.from, q.to, DEFAULT_TZ);
      where.startsAt = { gte: start, lt: end };
    } else if (q.from) {
      // Solo "desde": todo lo que viene a partir de ese día (por ejemplo, las solicitudes pendientes).
      where.startsAt = { gte: rangeBoundsUtc(q.from, q.from, DEFAULT_TZ).start };
    } else if (q.to) {
      where.startsAt = { lt: rangeBoundsUtc(q.to, q.to, DEFAULT_TZ).end };
    }
    if (q.q) {
      const term = q.q.trim();
      const codeMatch = /^c-?(\d+)$/i.exec(term);
      where.OR = codeMatch
        ? [{ code: Number(codeMatch[1]) }]
        : [
            { patient: { nameNormalized: { contains: term.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '') } } },
            { patient: { documentNumber: { startsWith: term } } },
            { doctor: { fullName: { contains: term, mode: 'insensitive' } } },
          ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        include,
        orderBy: [{ [q.sortBy]: q.sortDir }, { startsAt: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const names = await this.userNames(rows);
    return {
      items: rows.map((r) => this.view(r, user, names)),
      total,
      page: q.page,
      pageSize: q.pageSize,
      pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  async get(id: string, user: SessionUser): Promise<AppointmentView> {
    const appt = await this.load(id, user);
    if (canSeeClinicalNote(user, appt) && appt.clinicalNote) {
      await this.audit.log({ userId: user.id, action: 'VIEW_CLINICAL', entity: 'Appointment', entityId: id, summary: `Consultó la nota clínica de ${appointmentCode(appt.code)}` });
    }
    return this.view(appt, user, await this.userNames([appt]));
  }

  /** Comprobante en PDF para imprimir o enviar al paciente. */
  async receipt(id: string, user: SessionUser): Promise<{ filename: string; pdf: Buffer }> {
    const a = await this.load(id, user);
    const code = appointmentCode(a.code);
    const pdf = await receiptPdf({
      code,
      status: a.status,
      startsAt: a.startsAt,
      timezone: a.clinic.timezone,
      patientName: `${a.patient.firstNames} ${a.patient.lastNames}`,
      doctorName: a.doctor.fullName,
      specialty: a.doctor.specialty,
      clinic: { name: a.clinic.name, address: a.clinic.address, phone: a.clinic.phone },
      publicToken: a.publicToken,
    });
    return { filename: `comprobante-${code}.pdf`, pdf };
  }

  async events(id: string, user: SessionUser): Promise<AppointmentEventView[]> {
    await this.load(id, user);
    const events = await this.prisma.appointmentEvent.findMany({ where: { appointmentId: id }, orderBy: { at: 'asc' } });
    const users = await this.prisma.user.findMany({ where: { id: { in: events.map((e) => e.byId).filter((x): x is string => !!x) } } });
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return events.map((e) => ({ id: e.id, type: e.type, at: e.at.toISOString(), by: e.byId ? (names.get(e.byId) ?? null) : null, summary: describeEvent(e.type, e.data) }));
  }

  async create(input: AppointmentCreate, user: SessionUser, meta: RequestMeta): Promise<AppointmentView> {
    if (user.role === 'MEDICO' && input.doctorId !== user.doctorId) throw DomainError.forbidden('Un médico solo puede agendar en su propia agenda.');
    this.assertWorksAt(user, input.clinicId);

    const [patient, doctor, clinic] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: input.patientId } }),
      this.prisma.doctor.findUnique({ where: { id: input.doctorId } }),
      this.prisma.clinic.findUnique({ where: { id: input.clinicId }, include: { schedules: true } }),
    ]);
    if (!patient) throw DomainError.notFound('al paciente');
    if (patient.mergedIntoId) throw DomainError.validation('Esa ficha de paciente fue unida a otra. Busque al paciente de nuevo.');
    if (!doctor) throw DomainError.notFound('al médico');
    if (!clinic) throw DomainError.notFound('la clínica');

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + (input.durationMinutes ?? clinic.slotMinutes) * 60000);

    const created = await this.prisma.$transaction(async (tx) => {
      await this.scheduling.assertBookable({ clinic, doctor, patientId: patient.id, startsAt, endsAt }, tx);
      const appt = await tx.appointment.create({
        data: { patientId: patient.id, doctorId: doctor.id, clinicId: clinic.id, startsAt, endsAt, reason: input.reason, createdById: user.id },
        include,
      });
      await this.event(tx, appt.id, 'CREATED', user.id, { startsAt, clinic: clinic.name, doctor: doctor.fullName });
      if (input.waitlistEntryId) {
        await tx.waitlistEntry.updateMany({ where: { id: input.waitlistEntryId, status: { in: ['WAITING', 'OFFERED'] } }, data: { status: 'BOOKED', resolvedAt: new Date() } });
      }
      await this.audit.log(
        {
          userId: user.id,
          action: 'CREATE',
          entity: 'Appointment',
          entityId: appt.id,
          summary: `Agendó ${appointmentCode(appt.code)}: ${patient.firstNames} ${patient.lastNames} con ${doctor.fullName}, ${clinic.name}, ${formatLocal(startsAt, clinic.timezone)}`,
          after: snapshot(appt),
          meta,
        },
        tx,
      );
      await this.notifications.toPatient(tx, patient.id, {
        kind: 'CITA_AGENDADA',
        title: 'La clínica le agendó una cita',
        body: `${capital(formatLocal(startsAt, clinic.timezone))} con ${doctor.fullName}, ${clinic.name}.`,
        link: PATIENT_LINK,
        appointmentId: appt.id,
      });
      return appt;
    });
    return this.view(created, user, new Map([[user.id, user.fullName]]));
  }

  async reschedule(id: string, input: AppointmentRescheduleInput, user: SessionUser, meta: RequestMeta): Promise<AppointmentView> {
    const before = await this.loadToChange(id, user);
    if (before.status !== 'SCHEDULED' && before.status !== 'REQUESTED') {
      throw DomainError.validation(`Esta cita está "${APPOINTMENT_STATUS_LABELS[before.status].toLowerCase()}" y ya no se puede cambiar de hora. Agende una nueva.`);
    }
    const doctorId = input.doctorId ?? before.doctorId;
    if (user.role === 'MEDICO' && doctorId !== user.doctorId) throw DomainError.forbidden();
    if (input.clinicId) this.assertWorksAt(user, input.clinicId);
    const [doctor, clinic] = await Promise.all([
      this.prisma.doctor.findUniqueOrThrow({ where: { id: doctorId } }),
      this.prisma.clinic.findUniqueOrThrow({ where: { id: input.clinicId ?? before.clinicId }, include: { schedules: true } }),
    ]);
    const startsAt = new Date(input.startsAt);
    const duration = input.durationMinutes ?? (before.endsAt.getTime() - before.startsAt.getTime()) / 60000;
    const endsAt = new Date(startsAt.getTime() + duration * 60000);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.scheduling.assertBookable({ clinic, doctor, patientId: before.patientId, startsAt, endsAt, ignoreAppointmentId: id }, tx);
      const appt = await tx.appointment.update({ where: { id }, data: { startsAt, endsAt, doctorId: doctor.id, clinicId: clinic.id }, include });
      await this.event(tx, id, 'RESCHEDULED', user.id, { from: before.startsAt, to: startsAt, clinic: clinic.name, doctor: doctor.fullName });
      await this.audit.log(
        {
          userId: user.id,
          action: 'RESCHEDULE',
          entity: 'Appointment',
          entityId: id,
          summary: `Cambió ${appointmentCode(appt.code)} de ${formatLocal(before.startsAt, before.clinic.timezone)} a ${formatLocal(startsAt, clinic.timezone)}`,
          before: snapshot(before),
          after: snapshot(appt),
          meta,
        },
        tx,
      );
      await this.notifications.toPatient(tx, before.patientId, {
        kind: 'CITA_MOVIDA',
        title: 'Su cita cambió',
        body: `Antes: ${formatLocal(before.startsAt, before.clinic.timezone)} con ${before.doctor.fullName}, ${before.clinic.name}. Ahora: ${formatLocal(startsAt, clinic.timezone)} con ${doctor.fullName}, ${clinic.name}.`,
        link: PATIENT_LINK,
        appointmentId: id,
      });
      return appt;
    });
    return this.view(updated, user, await this.userNames([updated]));
  }

  /**
   * Cancelar es fácil (cualquier usuario, un motivo de una lista) pero nunca destructivo:
   * la cita queda guardada como cancelada, con quién y por qué, y se puede reactivar.
   * Cancelar dos veces no es un error: la segunda vez simplemente informa que ya estaba cancelada.
   */
  async cancel(id: string, input: AppointmentCancelInput, user: SessionUser, meta: RequestMeta) {
    const before = await this.loadToChange(id, user);
    if (before.status === 'CANCELLED') {
      return { appointment: this.view(before, user, await this.userNames([before])), alreadyCancelled: true, waitlistMatches: 0 };
    }
    if (before.status !== 'SCHEDULED' && before.status !== 'REQUESTED') {
      throw DomainError.validation(`Esta cita ya fue marcada como "${APPOINTMENT_STATUS_LABELS[before.status].toLowerCase()}"; no se puede cancelar.`);
    }

    // Actualización condicional: si dos personas cancelan a la vez, solo una registra la cancelación.
    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.appointment.updateMany({
        where: { id, status: { in: ['SCHEDULED', 'REQUESTED'] } },
        data: { status: 'CANCELLED', cancelReason: input.reason, cancelNote: input.note, cancelledAt: new Date(), cancelledById: user.id },
      });
      if (count === 0) return null;
      await this.event(tx, id, 'CANCELLED', user.id, { reason: input.reason, note: input.note });
      await this.audit.log(
        {
          userId: user.id,
          action: 'CANCEL',
          entity: 'Appointment',
          entityId: id,
          summary: `Canceló ${appointmentCode(before.code)} (${CANCEL_REASON_LABELS[input.reason]}${input.note ? ': ' + input.note : ''})`,
          before: snapshot(before),
          meta,
        },
        tx,
      );
      await this.notifications.toPatient(tx, before.patientId, {
        kind: 'CITA_CANCELADA',
        title: 'Su cita fue cancelada',
        body: `${capital(formatLocal(before.startsAt, before.clinic.timezone))} con ${before.doctor.fullName}, ${before.clinic.name}. Motivo: ${CANCEL_REASON_LABELS[input.reason].toLowerCase()}. Si necesita otra, agéndela aquí o llame a la clínica.`,
        link: PATIENT_LINK,
        appointmentId: id,
      });
      return tx.appointment.findUniqueOrThrow({ where: { id }, include });
    });

    const appt = result ?? (await this.load(id, user));
    // ¿Qué pasa con la hora que quedó libre? Se avisa si hay pacientes esperando en esa clínica.
    const waitlistMatches = await this.prisma.waitlistEntry.count({
      where: { clinicId: appt.clinicId, status: 'WAITING', OR: [{ doctorId: null }, { doctorId: appt.doctorId }] },
    });
    return { appointment: this.view(appt, user, await this.userNames([appt])), alreadyCancelled: result === null, waitlistMatches };
  }

  /** "Deshacer" una cancelación: solo si la hora no ha pasado y nadie más ocupó ese espacio. */
  /**
   * Aceptar una solicitud en línea: pasa a "Agendada". Si dos recepcionistas aceptan a la vez,
   * solo una lo registra (la otra ve la cita ya agendada).
   */
  async accept(id: string, user: SessionUser, meta: RequestMeta): Promise<AppointmentView> {
    const before = await this.loadToChange(id, user);
    if (before.status === 'SCHEDULED') return this.view(before, user, await this.userNames([before]));
    if (before.status !== 'REQUESTED') throw DomainError.validation(`Esta cita está "${APPOINTMENT_STATUS_LABELS[before.status].toLowerCase()}"; ya no se puede aceptar.`);
    const appt = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.appointment.updateMany({ where: { id, status: 'REQUESTED' }, data: { status: 'SCHEDULED' } });
      if (count) {
        await this.event(tx, id, 'ACCEPTED', user.id, {});
        await this.audit.log(
          { userId: user.id, action: 'ACCEPT', entity: 'Appointment', entityId: id, summary: `Aceptó la solicitud en línea ${appointmentCode(before.code)}`, before: { status: 'REQUESTED' }, after: { status: 'SCHEDULED' }, meta },
          tx,
        );
        await this.notifications.toPatient(tx, before.patientId, {
          kind: 'CITA_ACEPTADA',
          title: 'Su cita fue confirmada',
          body: `${capital(formatLocal(before.startsAt, before.clinic.timezone))} con ${before.doctor.fullName}, ${before.clinic.name}. Le esperamos 10 minutos antes.`,
          link: PATIENT_LINK,
          appointmentId: id,
        });
      }
      return tx.appointment.findUniqueOrThrow({ where: { id }, include });
    });
    return this.view(appt, user, await this.userNames([appt]));
  }

  /** Rechazar una solicitud en línea: queda cancelada con el motivo y la nota, y el horario se libera. */
  async reject(id: string, input: AppointmentRejectInput, user: SessionUser, meta: RequestMeta): Promise<AppointmentView> {
    const before = await this.loadToChange(id, user);
    if (before.status !== 'REQUESTED') throw DomainError.validation('Solo se pueden rechazar las citas que el paciente pidió en línea y aún no se aceptan.');
    const appt = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.appointment.updateMany({
        where: { id, status: 'REQUESTED' },
        data: { status: 'CANCELLED', cancelReason: 'SOLICITUD_RECHAZADA', cancelNote: input.note ?? null, cancelledAt: new Date(), cancelledById: user.id },
      });
      if (count) {
        await this.event(tx, id, 'CANCELLED', user.id, { reason: 'SOLICITUD_RECHAZADA', note: input.note });
        await this.audit.log(
          {
            userId: user.id,
            action: 'REJECT',
            entity: 'Appointment',
            entityId: id,
            summary: `No aceptó la solicitud en línea ${appointmentCode(before.code)}${input.note ? ': ' + input.note : ''}`,
            meta,
          },
          tx,
        );
        await this.notifications.toPatient(tx, before.patientId, {
          kind: 'CITA_RECHAZADA',
          title: 'La clínica no pudo aceptar su solicitud',
          body: `${capital(formatLocal(before.startsAt, before.clinic.timezone))} con ${before.doctor.fullName}, ${before.clinic.name}.${input.note ? ' ' + input.note : ''} Puede pedir otra hora.`,
          link: PATIENT_LINK,
          appointmentId: id,
        });
      }
      return tx.appointment.findUniqueOrThrow({ where: { id }, include });
    });
    return this.view(appt, user, await this.userNames([appt]));
  }

  async restore(id: string, user: SessionUser, meta: RequestMeta): Promise<AppointmentView> {
    const before = await this.loadToChange(id, user);
    if (before.status !== 'CANCELLED') return this.view(before, user, await this.userNames([before]));
    if (before.startsAt.getTime() < Date.now()) {
      throw DomainError.conflict(ErrorCodes.UNDO_NOT_POSSIBLE, 'Esta cita ya pasó; no se puede reactivar. Agende una nueva.');
    }
    const restored = await this.prisma.$transaction(async (tx) => {
      try {
        await this.scheduling.assertBookable(
          { clinic: before.clinic, doctor: before.doctor, patientId: before.patientId, startsAt: before.startsAt, endsAt: before.endsAt, ignoreAppointmentId: id },
          tx,
        );
      } catch (e) {
        if (e instanceof DomainError && (e.code === ErrorCodes.SLOT_TAKEN || e.code === ErrorCodes.PATIENT_OVERLAP)) {
          throw DomainError.conflict(ErrorCodes.UNDO_NOT_POSSIBLE, `No se puede reactivar: ${e.message}`);
        }
        throw e;
      }
      const appt = await tx.appointment.update({
        where: { id },
        data: { status: 'SCHEDULED', cancelReason: null, cancelNote: null, cancelledAt: null, cancelledById: null },
        include,
      });
      await this.event(tx, id, 'RESTORED', user.id, null);
      await this.audit.log(
        { userId: user.id, action: 'RESTORE', entity: 'Appointment', entityId: id, summary: `Reactivó ${appointmentCode(appt.code)} (deshizo la cancelación)`, before: snapshot(before), after: snapshot(appt), meta },
        tx,
      );
      await this.notifications.toPatient(tx, before.patientId, {
        kind: 'CITA_REACTIVADA',
        title: 'Su cita sigue en pie',
        body: `La clínica deshizo la cancelación: ${formatLocal(before.startsAt, before.clinic.timezone)} con ${before.doctor.fullName}, ${before.clinic.name}.`,
        link: PATIENT_LINK,
        appointmentId: id,
      });
      return appt;
    });
    return this.view(restored, user, await this.userNames([restored]));
  }

  async setStatus(id: string, input: AppointmentStatusUpdateInput, user: SessionUser, meta: RequestMeta): Promise<AppointmentView> {
    const before = await this.loadToChange(id, user);
    if (before.status === 'CANCELLED') throw DomainError.validation('La cita está cancelada. Si fue un error, primero reactívela.');
    if (before.status === 'REQUESTED') throw DomainError.validation('Esta cita la pidió el paciente en línea y aún no se acepta. Acéptela primero.');
    if (before.startsAt.getTime() > Date.now() + 15 * 60000) {
      throw DomainError.validation('Solo se puede marcar la asistencia cuando llega la hora de la cita.');
    }
    const appt = await this.prisma.$transaction(async (tx) => {
      const a = await tx.appointment.update({ where: { id }, data: { status: input.status }, include });
      await this.event(tx, id, input.status, user.id, { from: before.status });
      await this.audit.log(
        { userId: user.id, action: 'STATUS', entity: 'Appointment', entityId: id, summary: `Marcó ${appointmentCode(a.code)} como "${APPOINTMENT_STATUS_LABELS[input.status]}"`, before: { status: before.status }, after: { status: input.status }, meta },
        tx,
      );
      return a;
    });
    return this.view(appt, user, await this.userNames([appt]));
  }

  async setClinicalNote(id: string, input: ClinicalNoteInput, user: SessionUser, meta: RequestMeta): Promise<AppointmentView> {
    const before = await this.loadToChange(id, user);
    if (!canSeeClinicalNote(user, before)) throw DomainError.forbidden('Solo el médico de la cita puede escribir la nota clínica.');
    const appt = await this.prisma.$transaction(async (tx) => {
      const a = await tx.appointment.update({ where: { id }, data: { clinicalNote: input.clinicalNote }, include });
      await this.event(tx, id, 'NOTE_UPDATED', user.id, null);
      // El contenido clínico no se copia a la bitácora: solo que hubo un cambio.
      await this.audit.log({ userId: user.id, action: 'CLINICAL_NOTE', entity: 'Appointment', entityId: id, summary: `Actualizó la nota clínica de ${appointmentCode(a.code)}`, meta }, tx);
      return a;
    });
    return this.view(appt, user, await this.userNames([appt]));
  }

  /** Marca (o desmarca) que ya se le recordó la cita al paciente, para que dos recepcionistas no llamen dos veces. */
  async setReminded(id: string, reminded: boolean, user: SessionUser, meta: RequestMeta): Promise<AppointmentView> {
    const before = await this.loadToChange(id, user);
    const appt = await this.prisma.$transaction(async (tx) => {
      const a = await tx.appointment.update({
        where: { id },
        data: reminded ? { remindedAt: new Date(), remindedById: user.id } : { remindedAt: null, remindedById: null },
        include,
      });
      await this.audit.log(
        { userId: user.id, action: reminded ? 'REMINDED' : 'REMINDER_UNDONE', entity: 'Appointment', entityId: id, summary: `${reminded ? 'Recordó' : 'Desmarcó el recordatorio de'} ${appointmentCode(before.code)} a ${before.patient.firstNames} ${before.patient.lastNames}`, meta },
        tx,
      );
      return a;
    });
    return this.view(appt, user, await this.userNames([appt]));
  }

  /** Solo se dan y se cambian citas en las clínicas donde se trabaja. */
  private assertWorksAt(user: SessionUser, clinicId: string) {
    if (!worksAt(user, clinicId)) throw DomainError.forbidden('Usted no trabaja en esa clínica. Pida a la dirección que se la asigne en Usuarios.');
  }

  /** La cita, para cambiarla: además de poder verla, hay que trabajar en su clínica. */
  private async loadToChange(id: string, user: SessionUser) {
    const appt = await this.load(id, user);
    this.assertWorksAt(user, appt.clinicId);
    return appt;
  }

  private async load(id: string, user: SessionUser) {
    const appt = await this.prisma.appointment.findUnique({ where: { id }, include });
    if (!appt) throw DomainError.notFound('la cita');
    if (user.role === 'MEDICO' && appt.doctorId !== user.doctorId) throw DomainError.forbidden('Esta cita no es de su agenda.');
    return appt;
  }

  private view(appt: AppointmentWithRelations, user: SessionUser, names: Map<string, string>): AppointmentView {
    const v = toAppointmentView(appt, user, names);
    if (appt.status === 'CANCELLED') v.canUndoCancel = appt.startsAt.getTime() > Date.now();
    return v;
  }

  private async userNames(rows: { createdById: string | null; cancelledById: string | null; remindedById: string | null }[]) {
    const ids = [...new Set(rows.flatMap((r) => [r.createdById, r.cancelledById, r.remindedById]).filter((x): x is string => !!x))];
    if (!ids.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  private event(db: Db, appointmentId: string, type: string, byId: string, data: unknown) {
    return db.appointmentEvent.create({ data: { appointmentId, type, byId, data: data == null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue) } });
  }
}

function snapshot(a: AppointmentWithRelations) {
  return {
    code: appointmentCode(a.code),
    status: a.status,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    patient: `${a.patient.firstNames} ${a.patient.lastNames}`,
    doctor: a.doctor.fullName,
    clinic: a.clinic.name,
    reason: a.reason,
  };
}

function describeEvent(type: string, data: Prisma.JsonValue): string {
  const d = (data ?? {}) as Record<string, string>;
  switch (type) {
    case 'CREATED':
      return d.via === 'web' ? `El paciente agendó en línea con ${d.doctor} en ${d.clinic}` : `Cita agendada con ${d.doctor} en ${d.clinic}`;
    case 'RESCHEDULED':
      return `Cambio de hora (${d.clinic}, ${d.doctor})`;
    case 'CANCELLED':
      return `Cancelada: ${CANCEL_REASON_LABELS[d.reason as keyof typeof CANCEL_REASON_LABELS] ?? d.reason}${d.note ? ' — ' + d.note : ''}`;
    case 'ACCEPTED':
      return 'La clínica aceptó la solicitud';
    case 'RESTORED':
      return 'Se deshizo la cancelación';
    case 'ATTENDED':
      return 'El paciente fue atendido';
    case 'NO_SHOW':
      return 'El paciente no asistió';
    case 'NOTE_UPDATED':
      return 'Nota clínica actualizada';
    case 'IMPORTED':
      return 'Importada desde archivo';
    default:
      return type;
  }
}
