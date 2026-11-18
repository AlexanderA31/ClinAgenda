# Instrucciones de uso — ClinAgenda

Para quien instala el sistema y para el personal de las clínicas.

## 1. Probarlo en una computadora (5 minutos)

Requisito: **Docker** con Docker Compose (o Podman con `podman-compose`).

```bash
git clone <url-del-repositorio> clinagenda
cd clinagenda
cp .env.example .env
# En .env cambie POSTGRES_PASSWORD (en las dos líneas donde aparece) y JWT_SECRET.
#   Para JWT_SECRET puede usar: openssl rand -hex 32
docker compose up --build
```

Cuando aparezca `API lista`, abra **http://localhost:3000**. La primera vez se cargan **datos de demostración inventados**: 3 clínicas, 12 médicos, 160 pacientes y unas 950 citas.

| Usuario | Quién es | Contraseña |
|---|---|---|
| `paredes` | Dra. Paredes (dirección: ve todo) | `Demo2026!` |
| `rosa`, `lucia`, `andrea`, `carmen`, `pilar` | Recepcionistas | `Demo2026!` |
| `salazar` | Dr. Salazar (atiende en Centro y Norte) | `Demo2026!` |

## 2. Instalarlo para las clínicas (producción)

Las tres clínicas deben entrar al mismo sistema por internet, así que va en un servidor (en la nube o en la clínica principal con IP fija) con un dominio.

1. Apunte el dominio (ej. `agenda.clinicasparedes.ec`) a la IP del servidor.
2. En `.env`:
   - `DOMAIN=agenda.clinicasparedes.ec`
   - `WEB_ORIGIN=https://agenda.clinicasparedes.ec`
   - `COOKIE_SECURE=true`
   - `SEED_MODE=inicial` (para **no** cargar datos de demostración)
   - `SEED_DEMO_PASSWORD`: clave temporal del usuario `admin`
   - `BACKUP_COPY_PATH`: carpeta fuera del servidor (ver §6)
3. Levante con HTTPS automático:
   ```bash
   docker compose --profile produccion up -d --build
   ```
4. Ingrese con el usuario `admin` y la clave temporal: el sistema pide cambiarla. La base arranca solo con las 3 clínicas (horario base de lunes a viernes, 08:00 a 17:00). Luego:
   - *Clínicas*: revise horarios y días cerrados.
   - *Importar datos* o *Médicos* → *Registrar médico*: los médicos con su horario.
   - *Usuarios*: una cuenta por persona (la doctora, cada recepcionista y cada médico).
   - *Importar datos*: pacientes y citas futuras del cuaderno o de Excel.
5. Abra `https://<su dominio>` desde cada clínica. En el celular o la computadora de recepción, use “Instalar aplicación” del navegador para tener un ícono propio que abra aunque falle el internet.

La API no queda expuesta a internet: solo la web, que le reenvía las peticiones.

## 3. Guía rápida para recepción

| Para… | Haga esto |
|---|---|
| **Dar una cita** | *Agenda del día* → toque una hora que diga “Agendar aquí” (o *Nueva cita*) → busque al paciente → elija la hora → lea la frase al paciente → *Confirmar cita*. Si tiene WhatsApp, toque **Enviar por WhatsApp**: le llega la confirmación con su enlace para cancelar. |
| **Registrar un paciente nuevo** | Dentro de *Nueva cita* o en *Pacientes* → *Registrar paciente*. Si el sistema muestra pacientes parecidos, revise si es uno de ellos antes de crear otro. |
| **Cancelar** | Toque la cita → *Cancelar cita* → elija el motivo → confirme. Si fue un error, toque **Deshacer**. |
| **Cambiar de hora** | Toque la cita → *Cambiar día u hora*. |
| **Recordar las citas de mañana** | *Recordatorios* → toque **WhatsApp** o **Llamar** en cada paciente; queda marcado como avisado. |
| **Paciente sin WhatsApp** | En la cita, *Imprimir comprobante*: lleva un código QR para cancelar. |
| **Paciente que pide una hora que no hay** | *Lista de espera* → *Agregar paciente*. Cuando alguien cancele, el sistema avisa. |
| **Se fue el internet** | Siga trabajando: las citas y cancelaciones quedan “pendientes de enviar” (aviso amarillo) y se envían solas. **No confirme al paciente** una cita pendiente hasta que se envíe. |
| **Letra pequeña o poca luz** | Arriba: *Letra grande* y el botón de luna (modo oscuro). |

## 4. Guía para la dirección

- **Panel**: citas por día, ocupación por clínica, horas pico, cancelaciones e inasistencias por médico. Arriba indica si los respaldos están al día.
- **Médicos** → *Editar horario*: días, horas y clínica de cada médico. Si el cambio deja citas fuera de su horario, el sistema no las cancela: muestra la lista para reprogramarlas (también en *Citas por reprogramar*).
- **Clínicas** → *Cerrar un día* (feriados): avisa cuántas citas hay que mover.
- **Usuarios**: una cuenta por persona; *Nueva contraseña* también desbloquea a quien se equivocó 5 veces.
- **Bitácora**: quién hizo qué y cuándo, incluidas las cancelaciones hechas por los propios pacientes.
- **Importar datos**: médicos, luego pacientes, luego citas, desde Excel guardado como CSV. Siempre muestra una vista previa antes de guardar.

## 5. Guía para médicos

*Agenda del día* muestra solo su agenda. Al abrir una cita puede marcar si el paciente fue atendido y escribir la **nota clínica**, que solo ven usted y la dirección. En *Panel* ve sus propias cifras.

## 6. Respaldos

- Cada 24 horas se guarda un respaldo comprimido y verificado en `./backups` (se conservan 14) y una **copia fuera del servidor** en `BACKUP_COPY_PATH`: un disco externo montado o una carpeta sincronizada con Google Drive u OneDrive.
- Si algo falla, la dirección ve un aviso rojo en el sistema.
- Respaldo inmediato: `docker compose restart backup`.

**Restaurar** (primero en una base aparte, para comparar):

```bash
docker compose exec db createdb -U clinagenda clinagenda_restaurada
gunzip -c backups/clinagenda-AAAAMMDD-HHMMSS.sql.gz | docker compose exec -T db psql -U clinagenda -d clinagenda_restaurada
```

Para reemplazar la principal: detenga `api` y `web`, renombre las bases con `ALTER DATABASE … RENAME TO …` y vuelva a levantar.

## 7. Si algo no funciona

| Síntoma | Qué revisar |
|---|---|
| Nadie puede entrar | `docker compose ps`: los servicios deben decir *healthy*. `docker compose logs api --tail 50`. |
| Un mensaje dice “avise con el código XXXX” | Busque ese código en `docker compose logs api`. |
| Aviso rojo de respaldos | Que el disco o la carpeta externa esté conectada; `docker compose logs backup`. |
| La Clínica Sur no ve la agenda sin internet | Debe haberla abierto al menos una vez con conexión ese día. |

## 8. Para programadores

```bash
npm install && npm run build:schemas
npm test -w @clinagenda/schemas        # validadores y reglas del paciente (32 pruebas)

# Pruebas de punta a punta con una base aparte (la de Docker Compose no publica su puerto)
docker run -d --name clinagenda-test -e POSTGRES_USER=clinagenda -e POSTGRES_PASSWORD=test -e POSTGRES_DB=clinagenda -p 5432:5432 postgres:17-alpine
cd apps/api
export DATABASE_URL=postgresql://clinagenda:test@localhost:5432/clinagenda JWT_SECRET=$(openssl rand -hex 32)
npx prisma migrate deploy && npm run seed && npm run test:e2e   # 13 pruebas

# Desarrollo con recarga
npm run dev:api   # API en :4000, Swagger en /api/docs
npm run dev:web   # Web en :3000
```

La documentación de la API está en **/api/docs** (Swagger).
