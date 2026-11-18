import { Injectable } from '@nestjs/common';
import type { Clinic, ClinicClosure, ClinicSchedule } from '@prisma/client';
import type { ClinicCreateInput, ClinicUpdateInput, ClinicView, ClosureCreateInput, OrphanAppointment, SessionUser } from '@clinagenda/schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import type { RequestMeta } from '../../common/decorators/auth.decorators';
import { hhmmToMinutes, inZone, isoDate, minutesOfDay, weekdayOf } from '../../common/utils/time';
import { appointmentCode } from '../../common/utils/views';

type ClinicFull = Clinic & { schedules: ClinicSchedule[]; closures: ClinicClosure[] };

export function toClinicView(c: ClinicFull): ClinicView {
  return {
    id: c.id,
    name: c.name,
    address: c.address,
    phone: c.phone,
    timezone: c.timezone,
    slotMinutes: c.slotMinutes,
    active: c.active,
    schedule: c.schedules
      .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
      .map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })),
    closures: c.closures
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((x) => ({ id: x.id, date: isoDate(x.date), reason: x.reason })),
  };
}

const include = { schedules: true, closures: { where: { date: { gte: new Date(Date.now() - 86400000) } } } } as const;

@Injectable()
export class ClinicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ClinicView[]> {
    const clinics = await this.prisma.clinic.findMany({ include, orderBy: { name: 'asc' } });
    return clinics.map(toClinicView);
  }

  async get(id: string): Promise<ClinicView> {
    const clinic = await this.prisma.clinic.findUnique({ where: { id }, include });
    if (!clinic) throw DomainError.notFound('la clínica');
    return toClinicView(clinic);
  }

  async create(input: ClinicCreateInput, actor: SessionUser, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          name: input.name,
          address: input.address,
          phone: input.phone,
          timezone: input.timezone,
          slotMinutes: input.slotMinutes,
          schedules: { create: input.schedule },
        },
        include,
      });
      const view = toClinicView(clinic);
      await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'Clinic', entityId: clinic.id, summary: `Creó la clínica ${clinic.name}`, after: view, meta }, tx);
      return view;
    });
  }

  async update(id: string, input: ClinicUpdateInput, actor: SessionUser, meta: RequestMeta): Promise<ClinicView & { appointmentsOutsideSchedule: OrphanAppointment[] }> {
    const before = await this.get(id);
    const view = await this.prisma.$transaction(async (tx) => {
      if (input.schedule) {
        await tx.clinicSchedule.deleteMany({ where: { clinicId: id } });
        await tx.clinicSchedule.createMany({ data: input.schedule.map((s) => ({ ...s, clinicId: id })) });
      }
      const clinic = await tx.clinic.update({
        where: { id },
        data: { name: input.name, address: input.address, phone: input.phone, timezone: input.timezone, slotMinutes: input.slotMinutes },
        include,
      });
      const view = toClinicView(clinic);
      await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'Clinic', entityId: id, summary: `Actualizó la clínica ${clinic.name}`, before, after: view, meta }, tx);
      return view;
    });
    return { ...view, appointmentsOutsideSchedule: await this.orphans(id) };
  }

  /**
   * Citas futuras que ya no caben en el horario de la clínica (se acortó un día o se cerró).
   * No se cancelan solas: se listan para que recepción llame a cada paciente y la reprograme.
   */
  async orphans(clinicId: string): Promise<OrphanAppointment[]> {
    const clinic = await this.prisma.clinic.findUniqueOrThrow({ where: { id: clinicId }, include: { schedules: true } });
    const future = await this.prisma.appointment.findMany({
      where: { clinicId, status: 'SCHEDULED', startsAt: { gt: new Date() } },
      include: { patient: true, doctor: true },
      orderBy: { startsAt: 'asc' },
    });
    return future
      .filter((a) => {
        const local = inZone(a.startsAt, clinic.timezone);
        const end = inZone(a.endsAt, clinic.timezone);
        const from = minutesOfDay(local);
        const to = end.hasSame(local, 'day') ? minutesOfDay(end) : 24 * 60;
        return !clinic.schedules.some((s) => s.weekday === weekdayOf(local) && hhmmToMinutes(s.startTime) <= from && to <= hhmmToMinutes(s.endTime));
      })
      .map((a) => ({
        id: a.id,
        code: appointmentCode(a.code),
        startsAt: a.startsAt.toISOString(),
        patientName: `${a.patient.firstNames} ${a.patient.lastNames}`,
        patientPhone: a.patient.phone ?? a.patient.guardianPhone,
        clinicName: clinic.name,
        doctorName: a.doctor.fullName,
      }));
  }

  /** Quitar un cierre puesto por error: ese día se vuelve a poder agendar. */
  async removeClosure(clinicId: string, closureId: string, actor: SessionUser, meta: RequestMeta) {
    const closure = await this.prisma.clinicClosure.findFirst({ where: { id: closureId, clinicId }, include: { clinic: true } });
    if (!closure) throw DomainError.notFound('ese cierre');
    await this.prisma.$transaction(async (tx) => {
      await tx.clinicClosure.delete({ where: { id: closureId } });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'DELETE',
          entity: 'ClinicClosure',
          entityId: closureId,
          summary: `Quitó el cierre de ${closure.clinic.name} del ${isoDate(closure.date)} (${closure.reason})`,
          meta,
        },
        tx,
      );
    });
    return { ok: true };
  }

  async addClosure(id: string, input: ClosureCreateInput, actor: SessionUser, meta: RequestMeta) {
    const clinic = await this.get(id);
    const date = new Date(`${input.date}T00:00:00Z`);
    const affected = await this.prisma.appointment.count({
      where: { clinicId: id, status: 'SCHEDULED', startsAt: { gte: date, lt: new Date(date.getTime() + 86400000) } },
    });
    const closure = await this.prisma.$transaction(async (tx) => {
      const c = await tx.clinicClosure.create({ data: { clinicId: id, date, reason: input.reason } });
      await this.audit.log(
        { userId: actor.id, action: 'CREATE', entity: 'ClinicClosure', entityId: c.id, summary: `Cerró ${clinic.name} el ${input.date}: ${input.reason}`, meta },
        tx,
      );
      return c;
    });
    // No se cancelan citas en silencio: se avisa cuántas hay para que recepción llame a esos pacientes.
    return { id: closure.id, date: input.date, reason: input.reason, appointmentsToReschedule: affected };
  }
}
