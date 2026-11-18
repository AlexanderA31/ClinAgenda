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
| **Leer la agenda** | *Agenda del día* es una cuadrícula: las horas hacia abajo y los médicos hacia los lados. Arriba, el resumen del día; los botones con nombres muestran un solo médico. La hora actual está marcada en azul. En el celular se ve un médico a la vez. |
| **Dar una cita** | *Agenda del día* → toque una celda que diga “Libre” (o *Nueva cita*) → busque al paciente → elija la hora → lea la frase al paciente → *Confirmar cita*. Si tiene WhatsApp, toque **Enviar por WhatsApp**: le llega la confirmación con su enlace para cancelar. |
| **Registrar un paciente nuevo** | Dentro de *Nueva cita* o en *Pacientes* → *Registrar paciente*. Si el sistema muestra pacientes parecidos, revise si es uno de ellos antes de crear otro. |
| **Cancelar** | Toque la cita → *Cancelar cita* → elija el motivo → confirme. Si fue un error, toque **Deshacer**. |
| **Cambiar de hora** | Toque la cita → *Cambiar día u hora*. |
| **Recordar las citas de mañana** | *Recordatorios* → toque **WhatsApp** o **Llamar** en cada paciente; queda marcado como avisado. |
| **Paciente sin WhatsApp** | En la cita, *Imprimir comprobante*: lleva un código QR para cancelar. |
| **Paciente que pide una hora que no hay** | *Lista de espera* → *Agregar paciente*. Cuando alguien cancele, el sistema avisa. |
| **Se fue el internet** | Siga trabajando: las citas y cancelaciones quedan “pendientes de enviar” (aviso amarillo) y se envían solas. **No confirme al paciente** una cita pendiente hasta que se envíe. |
| **Letra pequeña o poca luz** | Botón azul redondo abajo a la derecha (en todas las pantallas): tamaño de letra, modo claro u oscuro, alto contraste, menos movimiento, enlaces subrayados y más espacio entre líneas. |
| **Mis datos y contraseña** | Toque su nombre arriba a la izquierda: se abre *Mi usuario* con sus datos, lo que puede hacer, el cambio de contraseña y el botón para cerrar su sesión en otros equipos. |
| **Cita agendada por el paciente en línea** | Aparece en la agenda como cualquier otra; en su historial dice “El paciente agendó en línea”. |

## 4. Guía para la dirección

- **Página pública** (la dirección del dominio, sin usuario): es la página de las clínicas para los pacientes. Muestra si cada clínica está abierta ahora, sus horarios, teléfonos y qué médico atiende dónde y cuándo. Se arma sola con los datos del sistema: al cambiar un horario, un cierre o un médico, la página se actualiza en pocos minutos.
- **Panel**: citas por día, ocupación por clínica, horas pico, cancelaciones e inasistencias por médico. Arriba indica si los respaldos están al día.
- **Médicos** → *Editar horario*: días, horas y clínica de cada médico. Si el cambio deja citas fuera de su horario, el sistema no las cancela: muestra la lista para reprogramarlas (también en *Citas por reprogramar*).
- **Clínicas** → *Editar*: nombre, dirección, teléfono, duración de cada turno y horario de cada día (con varios rangos por día, por ejemplo mañana y tarde, y “Copiar el lunes a martes–viernes”). Si el nuevo horario deja citas afuera, no se cancelan: aparece la lista para llamar a esos pacientes.
- **Clínicas** → *Cerrar un día* (feriados): avisa cuántas citas hay que mover. Un cierre puesto por error se quita con *Quitar*.
- **Portal del paciente**: desde la página pública, *Agendar en línea*. Hay **un solo ingreso** para todos (*Ingresar*, en /ingresar): el personal escribe su usuario y el paciente su cédula o pasaporte; el sistema abre la pantalla que corresponde. Ahí mismo está *Crear mi cuenta* para pacientes nuevos. El paciente adulto crea su cuenta con su cédula o pasaporte, elige clínica, médico, día y hora, y ve o cancela sus citas en *Mis citas*. Si olvida su contraseña, llama a la clínica (se puede atender igual por teléfono).
- **Usuarios**: una cuenta por persona. Con *Administrar* puede cambiar el rol, dar una contraseña temporal, desbloquear, cerrar sus sesiones en todos los equipos o desactivar la cuenta (el historial se conserva).
- **Roles y permisos**: qué ve y qué puede hacer cada rol. Puede crear roles a medida o duplicar uno existente y ajustarlo. La tabla de abajo muestra de un vistazo qué permiso tiene cada rol. El rol Dirección siempre tiene todo.
- **Sistema**: respaldos, usuarios bloqueados, intentos fallidos de ingreso en las últimas 24 horas y datos del servidor para soporte. Conviene mirarlo cada mañana.
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
