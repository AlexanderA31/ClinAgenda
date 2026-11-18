import { z } from 'zod';

export const RoleSchema = z.enum(['ADMIN', 'RECEPCION', 'MEDICO']);
export type Role = z.infer<typeof RoleSchema>;
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Dirección',
  RECEPCION: 'Recepción',
  MEDICO: 'Médico',
};

export const DocumentTypeSchema = z.enum(['CEDULA', 'PASAPORTE', 'SIN_DOCUMENTO']);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CEDULA: 'Cédula',
  PASAPORTE: 'Pasaporte',
  SIN_DOCUMENTO: 'Sin documento',
};

export const AppointmentStatusSchema = z.enum(['SCHEDULED', 'ATTENDED', 'NO_SHOW', 'CANCELLED']);
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Agendada',
  ATTENDED: 'Atendida',
  NO_SHOW: 'No asistió',
  CANCELLED: 'Cancelada',
};

export const CancelReasonSchema = z.enum(['PACIENTE_LLAMO', 'MEDICO_NO_DISPONIBLE', 'ERROR_AL_AGENDAR', 'REPROGRAMADA', 'OTRO']);
export type CancelReason = z.infer<typeof CancelReasonSchema>;
export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  PACIENTE_LLAMO: 'El paciente avisó que no viene',
  MEDICO_NO_DISPONIBLE: 'El médico no puede atender',
  ERROR_AL_AGENDAR: 'Se agendó por error',
  REPROGRAMADA: 'Se cambió a otra fecha',
  OTRO: 'Otro motivo',
};

export const SexSchema = z.enum(['F', 'M', 'X']);
export type Sex = z.infer<typeof SexSchema>;

export const WaitlistStatusSchema = z.enum(['WAITING', 'OFFERED', 'BOOKED', 'REMOVED']);
export type WaitlistStatus = z.infer<typeof WaitlistStatusSchema>;

export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
