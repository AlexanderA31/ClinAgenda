import { z } from 'zod';
import { IsoDateTimeSchema } from './common';

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

export const NotificationViewSchema = z.object({
  id: z.string().uuid(),
  kind: NotificationKind,
  title: z.string(),
  body: z.string(),
  /** Pantalla que se abre al tocar el aviso. */
  link: z.string().nullable(),
  appointmentId: z.string().uuid().nullable(),
  read: z.boolean(),
  createdAt: IsoDateTimeSchema,
});
export type NotificationView = z.infer<typeof NotificationViewSchema>;

export const NotificationListSchema = z.object({ items: z.array(NotificationViewSchema), unread: z.number().int() });
export type NotificationList = z.infer<typeof NotificationListSchema>;
