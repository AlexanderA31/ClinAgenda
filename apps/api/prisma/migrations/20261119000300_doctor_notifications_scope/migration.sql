-- Un médico solo debe recibir avisos de sus propias citas (no ve a los pacientes de otros médicos).
-- Antes, un médico sin clínicas asignadas recibía las solicitudes y cancelaciones de todas las citas:
-- se borran esos avisos ya entregados, que mostraban nombres de pacientes ajenos.
DELETE FROM "Notification" n
USING "User" u, "Appointment" a
WHERE n."userId" = u.id
  AND n."appointmentId" = a.id
  AND u.role = 'MEDICO'
  AND a."doctorId" IS DISTINCT FROM u."doctorId";
