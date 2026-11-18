import { Injectable } from '@nestjs/common';
import type { Clinic, ClinicSchedule, Doctor } from '@prisma/client';
import { ErrorCodes, WEEKDAY_LABELS, type AvailabilitySlot } from '@clinagenda/schemas';
import { DateTime } from 'luxon';
import { Db, PrismaService } from '../../prisma/prisma.service';
import { DomainError } from '../../common/errors/domain-error';
import { dayBoundsUtc, formatLocal, hhmmToMinutes, inZone, localToUtc, minutesOfDay, minutesToHhmm, weekdayOf } from '../../common/utils/time';

/** Hasta cuánto tiempo en el futuro se puede agendar. */
export const MAX_DAYS_AHEAD = 365;
// Una solicitud en línea (REQUESTED) ya ocupa su horario hasta que la clínica la acepte o la rechace.
const ACTIVE_STATUSES = ['REQUESTED', 'SCHEDULED', 'ATTENDED', 'NO_SHOW'] as const;

export interface SlotRequest {
  clinic: Clinic & { schedules: ClinicSchedule[] };
  doctor: Doctor;
  patientId: string;
  startsAt: Date;
  endsAt: Date;
  /** Al reprogramar, la propia cita no cuenta como choque. */
  ignoreAppointmentId?: string;
}

/**
 * Reglas de "¿se puede agendar aquí?". Se revisan antes de guardar para dar un mensaje claro;
 * la base de datos vuelve a impedir los choques por si dos personas guardan al mismo tiempo.
 */
@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  async assertBookable(req: SlotRequest, db: Db = this.prisma) {
    const { clinic, doctor, startsAt, endsAt } = req;
    const now = new Date();

    // Turno por médico: si dos recepcionistas guardan a la vez, la segunda espera milisegundos a que
    // termine la primera y luego ve la cita ya creada (mensaje claro en vez de un choque en la base).
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${doctor.id}, 0))::text`;

    if (startsAt.getTime() < now.getTime()) {
      throw DomainError.validation('No se puede agendar en una fecha u hora que ya pasó. Revise el día y la hora.', {
        startsAt: 'Esta hora ya pasó.',
      });
    }
    if (startsAt.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86400000) {
      throw DomainError.validation('Solo se puede agendar hasta un año hacia adelante. Revise el año.', { startsAt: 'Fecha demasiado lejana.' });
    }
    if (!doctor.active) throw DomainError.validation(`${doctor.fullName} no está atendiendo actualmente.`, { doctorId: 'Médico inactivo.' });
    if (!clinic.active) throw DomainError.validation(`${clinic.name} no está atendiendo actualmente.`, { clinicId: 'Clínica inactiva.' });

    const local = inZone(startsAt, clinic.timezone);
    const localEnd = inZone(endsAt, clinic.timezone);
    const weekday = weekdayOf(local);
    const startMin = minutesOfDay(local);
    const endMin = localEnd.hasSame(local, 'day') ? minutesOfDay(localEnd) : 24 * 60;
    const dayLabel = `${WEEKDAY_LABELS[weekday].toLowerCase()} ${local.toFormat('dd/MM/yyyy')}`;

    const closure = await db.clinicClosure.findFirst({ where: { clinicId: clinic.id, date: new Date(`${local.toISODate()}T00:00:00Z`) } });
    if (closure) {
      throw DomainError.conflict(ErrorCodes.OUTSIDE_SCHEDULE, `${clinic.name} está cerrada el ${dayLabel} (${closure.reason}).`, { startsAt: 'Clínica cerrada ese día.' });
    }

    const opens = clinic.schedules.filter((s) => s.weekday === weekday);
    const withinClinic = opens.some((s) => hhmmToMinutes(s.startTime) <= startMin && endMin <= hhmmToMinutes(s.endTime));
    if (!withinClinic) {
      const hours = opens.length ? opens.map((s) => `${s.startTime} a ${s.endTime}`).join(' y ') : 'no atiende ese día';
      throw DomainError.conflict(ErrorCodes.OUTSIDE_SCHEDULE, `${clinic.name} el ${dayLabel}: ${hours}. La cita debe quedar dentro de ese horario.`, {
        startsAt: 'Fuera del horario de la clínica.',
      });
    }

    const assignments = await db.doctorAssignment.findMany({ where: { doctorId: doctor.id, weekday }, include: { clinic: true } });
    const here = assignments.filter((a) => a.clinicId === clinic.id);
    const withinDoctor = here.some((a) => hhmmToMinutes(a.startTime) <= startMin && endMin <= hhmmToMinutes(a.endTime));
    if (!withinDoctor) {
      const elsewhere = assignments.find((a) => a.clinicId !== clinic.id && hhmmToMinutes(a.startTime) < endMin && startMin < hhmmToMinutes(a.endTime));
      const message = elsewhere
        ? `${doctor.fullName} a esa hora atiende en ${elsewhere.clinic.name}, no en ${clinic.name}.`
        : here.length
          ? `${doctor.fullName} atiende en ${clinic.name} el ${WEEKDAY_LABELS[weekday].toLowerCase()} de ${here.map((a) => `${a.startTime} a ${a.endTime}`).join(' y ')}.`
          : `${doctor.fullName} no atiende en ${clinic.name} los ${WEEKDAY_LABELS[weekday].toLowerCase()}.`;
      throw DomainError.conflict(ErrorCodes.OUTSIDE_SCHEDULE, message, { startsAt: 'El médico no atiende aquí a esa hora.' });
    }

    const overlap = { startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, status: { in: [...ACTIVE_STATUSES] }, NOT: req.ignoreAppointmentId ? { id: req.ignoreAppointmentId } : undefined };
    const doctorClash = await db.appointment.findFirst({ where: { doctorId: doctor.id, ...overlap }, include: { clinic: true } });
    if (doctorClash) {
      const where = doctorClash.clinicId === clinic.id ? '' : ` en ${doctorClash.clinic.name}`;
      throw DomainError.conflict(
        ErrorCodes.SLOT_TAKEN,
        `${doctor.fullName} ya tiene una cita${where} el ${formatLocal(doctorClash.startsAt, clinic.timezone)}. Elija otra hora.`,
        { startsAt: 'Horario ocupado.' },
      );
    }
    const patientClash = await db.appointment.findFirst({ where: { patientId: req.patientId, ...overlap }, include: { clinic: true, doctor: true } });
    if (patientClash) {
      throw DomainError.conflict(
        ErrorCodes.PATIENT_OVERLAP,
        `Este paciente ya tiene cita con ${patientClash.doctor.fullName} en ${patientClash.clinic.name} a esa hora.`,
        { startsAt: 'El paciente ya tiene cita a esa hora.' },
      );
    }
  }

  /** Horarios libres y ocupados de un día, por médico. */
  async availability(clinicId: string, date: string, doctorId?: string): Promise<{ closed: string | null; slots: AvailabilitySlot[] }> {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId }, include: { schedules: true } });
    if (!clinic) throw DomainError.notFound('la clínica');
    const day = DateTime.fromISO(date, { zone: clinic.timezone });
    if (!day.isValid) throw DomainError.validation('La fecha no es válida.');
    const weekday = weekdayOf(day);

    const closure = await this.prisma.clinicClosure.findFirst({ where: { clinicId, date: new Date(`${date}T00:00:00Z`) } });
    if (closure) return { closed: closure.reason, slots: [] };

    const windows = clinic.schedules.filter((s) => s.weekday === weekday);
    if (!windows.length) return { closed: 'La clínica no atiende este día.', slots: [] };

    const assignments = await this.prisma.doctorAssignment.findMany({
      where: { clinicId, weekday, doctorId, doctor: { active: true } },
      include: { doctor: true },
      orderBy: [{ doctor: { fullName: 'asc' } }, { startTime: 'asc' }],
    });
    const { start, end } = dayBoundsUtc(date, clinic.timezone);
    const busy = await this.prisma.appointment.findMany({
      where: { doctorId: { in: assignments.map((a) => a.doctorId) }, status: { in: [...ACTIVE_STATUSES] }, startsAt: { lt: end }, endsAt: { gt: start } },
      select: { doctorId: true, startsAt: true, endsAt: true },
    });

    const now = Date.now();
    const slots: AvailabilitySlot[] = [];
    for (const a of assignments) {
      for (const w of windows) {
        const from = Math.max(hhmmToMinutes(a.startTime), hhmmToMinutes(w.startTime));
        const to = Math.min(hhmmToMinutes(a.endTime), hhmmToMinutes(w.endTime));
        for (let m = from; m + clinic.slotMinutes <= to; m += clinic.slotMinutes) {
          const s = localToUtc(date, m, clinic.timezone);
          const e = localToUtc(date, m + clinic.slotMinutes, clinic.timezone);
          const taken = busy.some((b) => b.doctorId === a.doctorId && b.startsAt < e && b.endsAt > s);
          slots.push({
            doctorId: a.doctorId,
            doctorName: a.doctor.fullName,
            startsAt: s.toISOString(),
            endsAt: e.toISOString(),
            label: minutesToHhmm(m),
            available: !taken && s.getTime() > now,
          });
        }
      }
    }
    return { closed: null, slots };
  }
}
