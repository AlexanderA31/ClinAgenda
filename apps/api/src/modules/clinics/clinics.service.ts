import { Injectable } from '@nestjs/common';
import type { Clinic, ClinicClosure, ClinicSchedule } from '@prisma/client';
import type { ClinicCreateInput, ClinicUpdateInput, ClinicView, ClosureCreateInput, SessionUser } from '@clinagenda/schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import type { RequestMeta } from '../../common/decorators/auth.decorators';
import { isoDate } from '../../common/utils/time';

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

  async update(id: string, input: ClinicUpdateInput, actor: SessionUser, meta: RequestMeta) {
    const before = await this.get(id);
    return this.prisma.$transaction(async (tx) => {
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
