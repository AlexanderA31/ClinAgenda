-- Solicitudes en línea: el paciente pide la cita y la clínica la confirma o la rechaza.
-- Una solicitud ya ocupa su horario (las restricciones de choque solo excluyen las canceladas).
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'REQUESTED' BEFORE 'SCHEDULED';
ALTER TYPE "CancelReason" ADD VALUE IF NOT EXISTS 'SOLICITUD_RECHAZADA' BEFORE 'OTRO';
