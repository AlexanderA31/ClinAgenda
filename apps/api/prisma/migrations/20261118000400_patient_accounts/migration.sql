-- Cuentas del portal del paciente: ingresan con su cédula o pasaporte y una contraseña.
CREATE TABLE "PatientAccount" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PatientAccount_patientId_key" ON "PatientAccount"("patientId");
CREATE UNIQUE INDEX "PatientAccount_login_key" ON "PatientAccount"("login");
ALTER TABLE "PatientAccount" ADD CONSTRAINT "PatientAccount_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
