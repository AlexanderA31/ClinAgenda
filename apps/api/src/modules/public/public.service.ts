import { HttpStatus, Injectable } from '@nestjs/common';
import { CANCEL_LINK_HOURS, ErrorCodes, type PublicAppointmentView, type PublicDirectory } from '@clinagenda/schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { formatLocal } from '../../common/utils/time';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, agendaLink } from '../notifications/notifications.service';
import { DomainError } from '../../common/errors/domain-error';
import { appointmentCode } from '../../common/utils/views';
import type { RequestMeta } from '../../common/decorators/auth.decorators';

/**
 * "Que cualquiera pueda cancelar una cita fácilmente": el paciente recibe (por WhatsApp o impreso)
 * un enlace secreto con su cita. Desde ahí la ve y la cancela sin llamar ni tener usuario.
 *
 * Reglas para que eso no haga perder citas:
 *  - El enlace muestra lo mínimo (primer nombre, hora, médico, clínica): sin cédula, teléfono ni datos médicos.
 *  - Solo cancela (no cambia de hora ni ve otras citas) y solo hasta CANCEL_LINK_HOURS antes; después, hay que llamar.
 *  - Exige confirmar con un botón (POST): abrir el enlace o su vista previa en WhatsApp no cancela nada.
 *  - Queda en la bitácora como "cancelada por el paciente desde su enlace" y recepción puede reactivarla.
 */
@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Para la página web de las clínicas: dónde, cuándo y con quién. Solo datos que una clínica publica. */
  async directory(): Promise<PublicDirectory> {
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const [clinics, doctors] = await Promise.all([
      this.prisma.clinic.findMany({
        where: { active: true },
        include: { schedules: true, closures: { where: { date: { gte: today, lt: new Date(today.getTime() + 30 * 86400000) } }, orderBy: { date: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.doctor.findMany({ where: { active: true }, include: { assignments: { include: { clinic: true } } }, orderBy: { fullName: 'asc' } }),
    ]);
    return {
      clinics: clinics.map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        phone: c.phone,
        timezone: c.timezone,
        schedule: c.schedules.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })).sort((a, b) => a.weekday - b.weekday),
        closures: c.closures.map((x) => ({ date: x.date.toISOString().slice(0, 10), reason: x.reason })),
      })),
      doctors: doctors.map((d) => ({
        id: d.id,
        fullName: d.fullName,
        specialty: d.specialty,
        assignments: d.assignments
          .map((a) => ({ clinicId: a.clinicId, clinicName: a.clinic.name, weekday: a.weekday, startTime: a.startTime, endTime: a.endTime }))
          .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)),
      })),
    };
  }

  async view(token: string): Promise<PublicAppointmentView> {
    return this.toView(await this.load(token));
  }

  async cancel(token: string, meta: RequestMeta): Promise<PublicAppointmentView & { alreadyCancelled: boolean }> {
    const appt = await this.load(token);
    if (appt.status === 'CANCELLED') return { ...this.toView(appt), alreadyCancelled: true };
    const view = this.toView(appt);
    if (!view.canCancel) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        ErrorCodes.CONFLICT,
        appt.status !== 'SCHEDULED' && appt.status !== 'REQUESTED'
          ? 'Esta cita ya no se puede cancelar.'
          : `Falta poco para su cita y ya no se puede cancelar por aquí. Por favor llame a ${appt.clinic.name}${appt.clinic.phone ? ' al ' + appt.clinic.phone : ''}.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.appointment.updateMany({
        where: { id: appt.id, status: { in: ['SCHEDULED', 'REQUESTED'] } },
        data: { status: 'CANCELLED', cancelReason: 'PACIENTE_WEB', cancelledAt: new Date(), cancelledById: null },
      });
      if (count) {
        await tx.appointmentEvent.create({ data: { appointmentId: appt.id, type: 'CANCELLED', data: { reason: 'PACIENTE_WEB' } } });
        await this.audit.log(
          { userId: null, action: 'CANCEL_BY_PATIENT', entity: 'Appointment', entityId: appt.id, summary: `El paciente canceló ${appointmentCode(appt.code)} desde su enlace`, meta },
          tx,
        );
        await this.notifications.toSchedulers(tx, appt, {
          kind: 'CANCELADA_POR_PACIENTE',
          title: 'Un paciente canceló su cita',
          body: `${appt.patient.firstNames} ${appt.patient.lastNames} canceló ${formatLocal(appt.startsAt, appt.clinic.timezone)} con ${appt.doctor.fullName}, ${appt.clinic.name}. El horario quedó libre.`,
          link: agendaLink(appt.startsAt, appt.clinic.timezone, appt.clinicId),
          appointmentId: appt.id,
        });
      }
      return tx.appointment.findUniqueOrThrow({ where: { id: appt.id }, include: { patient: true, doctor: true, clinic: true } });
    });
    return { ...this.toView(updated), alreadyCancelled: false };
  }

  private async load(token: string) {
    // Formato fijo: evita consultas con basura y no revela si un enlace "casi correcto" existe.
    if (!/^[a-f0-9]{36}$/.test(token)) throw DomainError.notFound('esa cita. Revise que el enlace esté completo');
    const appt = await this.prisma.appointment.findUnique({ where: { publicToken: token }, include: { patient: true, doctor: true, clinic: true } });
    if (!appt) throw DomainError.notFound('esa cita. Revise que el enlace esté completo');
    return appt;
  }

  private toView(a: Awaited<ReturnType<PublicService['load']>>): PublicAppointmentView {
    const deadline = new Date(a.startsAt.getTime() - CANCEL_LINK_HOURS * 3600_000);
    return {
      code: appointmentCode(a.code),
      status: a.status,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      patientFirstName: a.patient.firstNames.split(' ')[0],
      doctorName: a.doctor.fullName,
      specialty: a.doctor.specialty,
      clinic: { name: a.clinic.name, address: a.clinic.address, phone: a.clinic.phone },
      canCancel: (a.status === 'SCHEDULED' || a.status === 'REQUESTED') && Date.now() < deadline.getTime(),
      cancelDeadline: deadline.toISOString(),
    };
  }
}
