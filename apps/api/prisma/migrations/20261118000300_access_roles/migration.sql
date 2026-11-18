-- Roles y permisos administrables por la dirección.
CREATE TABLE "AccessRole" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "Role" NOT NULL,
    "permissions" TEXT[],
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AccessRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccessRole_name_key" ON "AccessRole"("name");

-- Los tres roles de fábrica, con los mismos permisos que tenían los roles fijos.
INSERT INTO "AccessRole" ("id", "name", "description", "scope", "permissions", "system", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000001', 'Dirección', 'Administra el sistema. Siempre tiene todos los permisos.', 'ADMIN',
   ARRAY['citas.agendar','citas.estado','citas.notas','recordatorios.gestionar','lista_espera.gestionar','pacientes.editar','pacientes.fusionar','panel.ver','medicos.gestionar','clinicas.gestionar','usuarios.gestionar','roles.gestionar','auditoria.ver','datos.importar','sistema.ver'], true, now()),
  ('00000000-0000-4000-8000-000000000002', 'Recepción', 'Da citas, registra pacientes y envía recordatorios.', 'RECEPCION',
   ARRAY['citas.agendar','citas.estado','recordatorios.gestionar','lista_espera.gestionar','pacientes.editar'], true, now()),
  ('00000000-0000-4000-8000-000000000003', 'Médico', 'Ve su agenda y sus pacientes y escribe notas clínicas.', 'MEDICO',
   ARRAY['citas.agendar','citas.estado','citas.notas','panel.ver'], true, now());

ALTER TABLE "User" ADD COLUMN "accessRoleId" UUID;
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
UPDATE "User" SET "accessRoleId" = CASE "role"
  WHEN 'ADMIN' THEN '00000000-0000-4000-8000-000000000001'::uuid
  WHEN 'RECEPCION' THEN '00000000-0000-4000-8000-000000000002'::uuid
  ELSE '00000000-0000-4000-8000-000000000003'::uuid END;
ALTER TABLE "User" ALTER COLUMN "accessRoleId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_accessRoleId_fkey" FOREIGN KEY ("accessRoleId") REFERENCES "AccessRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El alcance del usuario siempre es el de su rol.
CREATE FUNCTION user_role_matches_access_role() RETURNS trigger AS $$
BEGIN
  SELECT "scope" INTO NEW."role" FROM "AccessRole" WHERE "id" = NEW."accessRoleId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER user_role_sync BEFORE INSERT OR UPDATE OF "accessRoleId", "role" ON "User"
  FOR EACH ROW EXECUTE FUNCTION user_role_matches_access_role();
