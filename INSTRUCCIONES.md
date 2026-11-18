# Instrucciones de uso — probar ClinAgenda en 5 minutos

## 1. Levantar el sistema (1 minuto + tiempo de descarga)

Requisito: **Docker** con Docker Compose (o Podman con `podman-compose`).

```bash
git clone <url-del-repositorio> clinagenda
cd clinagenda
cp .env.example .env
# Edite .env y cambie al menos POSTGRES_PASSWORD (en las dos líneas donde aparece) y JWT_SECRET:
#   openssl rand -hex 32   ← sirve para JWT_SECRET
docker compose up --build
```

Cuando la consola muestre `API lista en http://localhost:4000/api`, abra:

| Qué | Dirección |
|---|---|
| Sistema (web) | http://localhost:3000 |
| Documentación de la API (Swagger) | http://localhost:4000/api/docs |
| Estado del sistema | http://localhost:4000/api/health |

La primera vez se cargan **datos inventados** de demostración: 3 clínicas, 12 médicos, 160 pacientes y unas 950 citas (5 semanas de historial y 2 de agenda futura).

## 2. Usuarios de demostración

Contraseña de todos: `Demo2026!` (variable `SEED_DEMO_PASSWORD`).

| Usuario | Quién es | Qué puede hacer |
|---|---|---|
| `rosa` | Doña Rosa, recepción Clínica Centro | Agenda, pacientes, citas, lista de espera |
| `lucia`, `andrea`, `carmen`, `pilar` | Recepcionistas | Igual que Rosa |
| `paredes` | Dra. Paredes, dirección | Todo, más panel, usuarios, importación y bitácora |
| `salazar` | Dr. Salazar (atiende en Centro y Norte) | Solo su agenda, sus pacientes y sus notas clínicas |

## 3. Recorrido sugerido para el jurado

1. **Agendar como doña Rosa.** Ingrese como `rosa` → *Agenda del día* → toque un horario “Agendar aquí” → busque `maria` (sin tilde) → elija una paciente → confirme. Observe la frase final para leer al paciente.
2. **Choque de horarios.** Abra dos navegadores (uno normal y otro en incógnito) como `rosa` y `lucia`. Elijan el mismo horario libre del mismo médico y confirmen casi a la vez: una queda guardada y la otra recibe “ese horario acaba de ser ocupado”.
3. **Médico en dos clínicas.** En la agenda, cambie a *Norte* un lunes por la mañana: el Dr. Salazar no aparece porque a esa hora está en Centro. (Por API: `POST /api/appointments` con Salazar en Norte a las 09:00 de un lunes → 409 con el motivo.)
4. **Cancelar y deshacer.** Abra una cita → *Cancelar cita* → elija el motivo → en el aviso presione **Deshacer**. Cancelarla dos veces no da error.
5. **Datos mal escritos.** *Pacientes → Registrar paciente*: pruebe cédula `0000000000`, teléfono `12345`, correo `juan@@gmail`, año `2090`. Cada error dice qué corregir y no borra lo escrito. Escriba un nombre parecido a uno existente (p. ej. `maria lopez`) y verá el aviso de posibles duplicados.
6. **Sin internet (Clínica Sur).** Con la agenda abierta, en las herramientas del navegador (F12 → Red → “Sin conexión”) intente agendar: la cita queda **pendiente de enviar** con aviso amarillo. Vuelva a conectar: se envía sola.
   *El modo sin conexión completo requiere la versión de producción (la de Docker), porque el service worker no se activa en modo desarrollo.*
7. **Dirección.** Ingrese como `paredes`: *Panel* (gráficos), *Bitácora* (quién hizo qué, incluido lo que hizo Rosa), *Usuarios*, *Importar datos*.
8. **Privacidad.** Como `salazar`, abra una de sus citas y escriba una nota clínica. Como `rosa`, abra la misma cita: la nota no aparece.

## 4. Importar los datos de prueba (entregados el martes)

Como `paredes` → *Importar datos* → elija el tipo (pacientes, médicos o citas) → *Revisar archivo*. Se muestra fila por fila qué entra, qué se corrigió automáticamente, qué ya existía y qué se rechazó y por qué. Nada se guarda hasta presionar *Confirmar e importar*. Orden recomendado: médicos, pacientes, citas.

## 5. Respaldos

El servicio `backup` guarda un respaldo comprimido cada 24 horas en la carpeta `./backups` (se conservan los últimos 14). Para restaurar uno:

```bash
docker compose stop api web
gunzip -c backups/clinagenda-AAAAMMDD-HHMMSS.sql.gz | docker compose exec -T db psql -U clinagenda -d clinagenda_restaurada
# (cree antes la base vacía: docker compose exec db createdb -U clinagenda clinagenda_restaurada)
```

Se restaura en una base aparte para comparar antes de reemplazar la principal. Para un respaldo inmediato: `docker compose restart backup`.

## 6. Pruebas automáticas

```bash
npm install && npm run build:schemas
npm test -w @clinagenda/schemas            # 32 pruebas: cédula, teléfonos, nombres, fechas, reglas del paciente
# Pruebas de punta a punta: usan una base de pruebas aparte (la de Docker Compose no publica su puerto, a propósito)
docker run -d --name clinagenda-test -e POSTGRES_USER=clinagenda -e POSTGRES_PASSWORD=test -e POSTGRES_DB=clinagenda -p 5432:5432 postgres:17-alpine
cd apps/api
export DATABASE_URL=postgresql://clinagenda:test@localhost:5432/clinagenda JWT_SECRET=$(openssl rand -hex 32)
npx prisma migrate deploy && npm run seed && npm run test:e2e   # 9 pruebas
```

## 7. Desarrollo sin Docker

```bash
npm install
npm run build:schemas
cd apps/api && npx prisma migrate deploy && npm run seed && npm run start:dev   # API en :4000
cd apps/web && npm run dev                                                      # Web en :3000
```
