import { z } from 'zod';

/** Qué pasó. Los primeros son para el paciente; los dos últimos, para el personal que agenda. */
export const NotificationKind = z.enum([
  'CITA_AGENDADA',
  'CITA_ACEPTADA',
  'CITA_RECHAZADA',
  'CITA_MOVIDA',
  'CITA_CANCELADA',
  'CITA_REACTIVADA',
  'SOLICITUD_NUEVA',
  'CANCELADA_POR_PACIENTE',
]);
export type NotificationKind = z.infer<typeof NotificationKind>;

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Pantalla que se abre al tocar el aviso. */
  link: string | null;
  appointmentId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationList {
  items: NotificationView[];
  unread: number;
}
