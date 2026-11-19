-- Cada persona del personal puede trabajar en varias clínicas (antes: una "clínica principal" opcional).
-- Sin ninguna fila aquí, trabaja en todas.

-- CreateTable
CREATE TABLE "UserClinic" (
    "userId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,

    CONSTRAINT "UserClinic_pkey" PRIMARY KEY ("userId","clinicId")
);

-- CreateIndex
CREATE INDEX "UserClinic_clinicId_idx" ON "UserClinic"("clinicId");

-- AddForeignKey
ALTER TABLE "UserClinic" ADD CONSTRAINT "UserClinic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClinic" ADD CONSTRAINT "UserClinic_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La clínica que ya tenía cada persona pasa a ser su clínica de trabajo.
INSERT INTO "UserClinic" ("userId", "clinicId") SELECT "id", "clinicId" FROM "User" WHERE "clinicId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_clinicId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "clinicId";
