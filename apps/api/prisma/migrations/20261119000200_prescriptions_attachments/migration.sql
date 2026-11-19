-- Ficha médica: código CIE-10 y receta en cada consulta, y archivos adjuntos (guardados en la base para que entren en el respaldo).
-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "diagnosisCode" TEXT,
ADD COLUMN     "prescription" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "MedicalAttachment" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "consultationId" UUID,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "description" TEXT,
    "sharedWithPatient" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MedicalAttachment_patientId_createdAt_idx" ON "MedicalAttachment"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "MedicalAttachment" ADD CONSTRAINT "MedicalAttachment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAttachment" ADD CONSTRAINT "MedicalAttachment_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAttachment" ADD CONSTRAINT "MedicalAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Límites que la API ya valida, repetidos aquí por si alguien escribe directo en la base.
ALTER TABLE "MedicalAttachment" ADD CONSTRAINT "MedicalAttachment_bytes_check" CHECK ("bytes" > 0 AND "bytes" <= 10485760);
ALTER TABLE "MedicalAttachment" ADD CONSTRAINT "MedicalAttachment_mime_check" CHECK ("mime" IN ('application/pdf','image/jpeg','image/png','image/webp'));
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_prescription_check" CHECK (jsonb_typeof("prescription") = 'array');
