import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NotificationKind, NotificationList, NotificationView } from '@clinagenda/schemas';
import { Db, PrismaService } from '../../prisma/prisma.service';
import { DomainError } from '../../common/errors/domain-error';
import { inZone } from '../../common/utils/time';

/** Quién recibe: un paciente (portal) o una persona del personal. */
export type Recipient = { patientId: string } | { userId: string };

export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string | null;
  appointmentId?: string | null;
}

/** Cuántos avisos se muestran; los más viejos quedan guardados pero no se listan. */
const LIST_SIZE = 30;

/**
 * Avisos internos: "su cita fue confirmada", "le cambiaron la hora", "nueva solicitud en línea".
 * Se escriben dentro de la misma transacción que el cambio: si el cambio no se guarda, tampoco el aviso.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Al paciente, solo si tiene cuenta en el portal: sin cuenta no tendría dónde verlo. */
  async toPatient(db: Db, patientId: string, input: NotificationInput) {
    const account = await db.patientAccount.findUnique({ where: { patientId }, select: { id: true } });
    if (!account) return;
    await db.notification.create({ data: { ...input, patientId } });
  }

  /**
   * A quienes agendan esa cita: personal activo con el permiso "citas.agendar" que puede verla.
   * Dirección siempre; recepción si trabaja en esa clínica (o en todas, ver workClinics); un médico solo
   * si la cita es suya, porque no ve a los pacientes de otros médicos.
   */
  async toSchedulers(db: Db, appt: { clinicId: string; doctorId: string }, input: NotificationInput) {
    const users = await db.user.findMany({
      where: {
        active: true,
        accessRole: { permissions: { has: 'citas.agendar' } },
        OR: [{ role: 'ADMIN' }, { role: 'RECEPCION', OR: [{ clinics: { none: {} } }, { clinics: { some: { clinicId: appt.clinicId } } }] }, { role: 'MEDICO', doctorId: appt.doctorId }],
      },
      select: { id: true },
    });
    if (users.length) await db.notification.createMany({ data: users.map((u) => ({ ...input, userId: u.id })) });
  }

  async list(to: Recipient): Promise<NotificationList> {
    const where = this.owner(to);
    const [rows, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: LIST_SIZE }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { items: rows.map(toView), unread };
  }

  async markRead(to: Recipient, id: string): Promise<NotificationList> {
    const { count } = await this.prisma.notification.updateMany({ where: { ...this.owner(to), id }, data: { readAt: new Date() } });
    if (!count) throw DomainError.notFound('ese aviso');
    return this.list(to);
  }

  async markAllRead(to: Recipient): Promise<NotificationList> {
    await this.prisma.notification.updateMany({ where: { ...this.owner(to), readAt: null }, data: { readAt: new Date() } });
    return this.list(to);
  }

  private owner(to: Recipient): Prisma.NotificationWhereInput {
    return 'patientId' in to ? { patientId: to.patientId } : { userId: to.userId };
  }
}

function toView(n: Prisma.NotificationGetPayload<object>): NotificationView {
  return {
    id: n.id,
    kind: n.kind as NotificationKind,
    title: n.title,
    body: n.body,
    link: n.link,
    appointmentId: n.appointmentId,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}

/** Enlace a la agenda del personal en el día y la clínica de la cita. */
export function agendaLink(date: Date, timeZone: string, clinicId: string) {
  return `/agenda?fecha=${inZone(date, timeZone).toISODate()}&clinica=${clinicId}`;
}
