-- Enlace del paciente (cancelar sin llamar) y registro de recordatorios.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TYPE "CancelReason" ADD VALUE IF NOT EXISTS 'PACIENTE_WEB' BEFORE 'OTRO';

ALTER TABLE "Appointment"
  ADD COLUMN "publicToken" TEXT NOT NULL DEFAULT encode(gen_random_bytes(18), 'hex'),
  ADD COLUMN "remindedAt" TIMESTAMPTZ(3),
  ADD COLUMN "remindedById" UUID;

CREATE UNIQUE INDEX "Appointment_publicToken_key" ON "Appointment"("publicToken");
