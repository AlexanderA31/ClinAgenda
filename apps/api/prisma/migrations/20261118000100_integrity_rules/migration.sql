-- Reglas de integridad que deben cumplirse aunque haya un error en el código
-- o dos recepcionistas presionen "Guardar" en el mismo segundo.

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1) Un médico no puede tener dos citas que se crucen en el tiempo, en NINGUNA clínica.
--    Resuelve a la vez el choque de horarios y "el Dr. Salazar en dos clínicas a la misma hora".
--    Las citas canceladas no ocupan el horario.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_doctor_no_overlap"
  EXCLUDE USING gist ("doctorId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE (status <> 'CANCELLED');

-- 2) Un paciente no puede estar en dos citas a la vez.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_patient_no_overlap"
  EXCLUDE USING gist ("patientId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE (status <> 'CANCELLED');

-- 3) La cita debe terminar después de empezar.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_valid_range" CHECK ("endsAt" > "startsAt");

-- 4) Un mismo documento no puede pertenecer a dos pacientes activos (los fusionados no cuentan).
CREATE UNIQUE INDEX "patient_document_unique"
  ON "Patient" ("documentType", "documentNumber")
  WHERE "documentNumber" IS NOT NULL AND "mergedIntoId" IS NULL;

-- 5) Búsqueda por nombre aproximado ("Maria Lopes" encuentra a "María López").
CREATE INDEX "patient_name_trgm" ON "Patient" USING gin ("nameNormalized" gin_trgm_ops);

-- 6) Días de la semana válidos.
ALTER TABLE "ClinicSchedule" ADD CONSTRAINT "clinic_schedule_weekday" CHECK (weekday BETWEEN 0 AND 6 AND "endTime" > "startTime");
ALTER TABLE "DoctorAssignment" ADD CONSTRAINT "doctor_assignment_weekday" CHECK (weekday BETWEEN 0 AND 6 AND "endTime" > "startTime");

-- 7) Nacimiento coherente (la validación amable está en la app; esto es la red de seguridad).
ALTER TABLE "Patient" ADD CONSTRAINT "patient_birthdate_range"
  CHECK ("birthDate" >= DATE '1900-01-01' AND "birthDate" <= CURRENT_DATE);

-- 8) Las citas no se borran: se cancelan. Así ninguna cita "se pierde".
CREATE OR REPLACE FUNCTION forbid_appointment_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Las citas no se eliminan; use la cancelación.' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointment_no_delete BEFORE DELETE ON "Appointment"
  FOR EACH ROW EXECUTE FUNCTION forbid_appointment_delete();

-- 9) La bitácora de auditoría es de solo agregar: nadie (ni la propia app) puede editarla o borrarla.
CREATE OR REPLACE FUNCTION forbid_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora de auditoría no se puede modificar.' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();

CREATE TRIGGER appointment_event_append_only BEFORE UPDATE OR DELETE ON "AppointmentEvent"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
