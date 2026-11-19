# ClinAgenda

Sistema de citas para las tres clínicas de la Dra. Paredes (Centro, Norte y Sur): 12 médicos, 5 recepcionistas y unos 400 pacientes al mes. Reemplaza el cuaderno y el WhatsApp con una agenda que **no deja cruzar citas**, **no pierde ninguna** y que una recepcionista sin experiencia en computadoras puede usar sola. Incluye la ficha médica de cada paciente, un portal donde los pacientes agendan y ven sus recetas, y una página pública de las clínicas.

Este documento reúne todo:

1. [Probarlo en 5 minutos](#1-probarlo-en-5-minutos)
2. [Arquitectura](#2-arquitectura)
3. [Las preguntas de la doctora y qué se decidió](#3-las-preguntas-de-la-doctora-y-qué-se-decidió)
4. [Supuestos](#4-supuestos-confirmar-con-la-doctora)
5. [Cómo se usa](#5-cómo-se-usa)
6. [Instalarlo para las clínicas](#6-instalarlo-para-las-clínicas)
7. [Respaldos y problemas](#7-respaldos-y-problemas)
8. [Para programadores](#8-para-programadores)

---

## 1. Probarlo en 5 minutos

Requisito: **Docker** con Docker Compose (o Podman con `podman-compose`).

```bash
git clone <url-del-repositorio> clinagenda && cd clinagenda
cp .env.example .env
# En .env cambie POSTGRES_PASSWORD (en las dos líneas donde aparece) y JWT_SECRET (openssl rand -hex 32)
docker compose up --build
```

Cuando aparezca `API lista`, abra **http://localhost:3000**. La primera vez se cargan **datos de demostración inventados**: 3 clínicas, 12 médicos, 160 pacientes y unas 950 citas. La API documentada (Swagger) queda en **http://localhost:4000/api/docs**.

| Usuario | Quién es | Contraseña |
|---|---|---|
| `paredes` | Dra. Paredes: dirección, ve todo, y también atiende | `Demo2026!` |
| `rosa`, `lucia`, `carmen`, `pilar` | Recepcionistas (Rosa y Lucía en Centro, Carmen y Pilar en Sur) | `Demo2026!` |
| `andrea` | Recepcionista de Norte y Centro | `Demo2026!` |
| `salazar` | Dr. Salazar: atiende en Centro y Norte, ve solo su agenda y sus pacientes | `Demo2026!` |

Para probar como paciente, use *Crear mi cuenta* en la pantalla de ingreso con una cédula válida inventada.

---

## 2. Arquitectura

```
                    ┌──────────────── packages/schemas (Zod) ────────────────┐
                    │  validadores y contratos compartidos por web y API     │
                    ▼                                                        ▼
Navegador ──► web (Next.js 15, :3000) ──/api/*──► api (NestJS 11, :4000) ──► PostgreSQL 17
 PWA, sin      página pública, portal del          módulos, guardias,         EXCLUDE, triggers,
 conexión      paciente y sistema interno          Swagger, Prisma            bitácora de solo agregar
                                                                                    ▲
                                                               backup (pg_dump diario, verificado
                                                               y copiado fuera del servidor)
```

| Pieza | Qué es |
|---|---|
| **`packages/schemas`** | El contrato compartido: esquemas Zod de cada entidad y validadores del dominio (cédula con dígito verificador, teléfonos E.164, limpieza de nombres, fechas, signos vitales, catálogo CIE-10). La API los usa para validar y generar Swagger (`nestjs-zod`); la web, para sus formularios y tipos. **Una regla se escribe en un solo lugar.** |
| **`apps/api`** | NestJS modular: `auth`, `users`, `roles`, `clinics`, `doctors`, `patients` (incluye la ficha médica), `appointments`, `waitlist`, `notifications`, `portal` (pacientes), `public` (enlace de la cita y página pública), `reports`, `imports`, `audit`, `system`, `health`. Guardias globales de sesión y de permisos (`@Can`), un filtro único de errores con mensajes en español, e idempotencia para reintentos. |
| **`apps/web`** | Next.js App Router, Tailwind 4 y componentes al estilo shadcn/ui. Tablas con TanStack Table (paginación en servidor), gráficos con Recharts, datos con TanStack Query. La web reenvía `/api/*` a la API, así sesión y caché son del mismo origen y la API no queda expuesta a internet. |
| **Base de datos** | PostgreSQL 17 con Prisma. Las reglas críticas viven en SQL (`apps/api/prisma/migrations`) y no dependen de que el programa no tenga errores: una restricción `EXCLUDE` impide citas solapadas por médico y por paciente; un trigger prohíbe borrar citas; otro impide editar la bitácora; y un índice de trigramas busca nombres aproximados. |
| **Docker Compose** | `db`, `api` (migra al arrancar), `web`, `backup` y `https` (Caddy con certificado automático, perfil `produccion`). Cada servicio se reinicia solo y reporta su salud. |

**Tres sesiones separadas, un solo ingreso.** El personal entra con su usuario y el paciente con su cédula o pasaporte, por la misma pantalla. Cada sesión es una cookie distinta: la del paciente no abre el sistema interno y la del personal no abre el portal.

**Permisos en dos capas.** Cada rol tiene un *alcance*, que decide qué datos ve (toda la información, sus clínicas sin datos clínicos, o solo su agenda), y *permisos*, que deciden qué puede hacer. Hay 16 permisos. El alcance manda: un rol de recepción nunca ve datos clínicos, aunque por error se le dé el permiso. Todo se verifica en la API, no solo ocultando botones.

```
.
├── apps/
│   ├── api/            NestJS + Prisma (src/modules/*, prisma/schema.prisma, prisma/migrations, test/*.e2e.ts)
│   └── web/            Next.js (app/page.tsx página pública, app/(app)/* sistema, app/paciente/* portal, components/*)
├── packages/schemas/   Zod + validadores + catálogo CIE-10 (con pruebas)
├── docker/             Dockerfiles, arranque de la API, script de respaldo, Caddyfile
└── docker-compose.yml
```

**Stack:** Node 22 · TypeScript · NestJS 11 · Prisma 6 · PostgreSQL 17 · Zod · Swagger · Next.js 15 · React 19 · Tailwind CSS 4 · TanStack Query y Table · Recharts · GSAP y Lenis (página pública) · pdfkit (comprobantes y recetas) · Docker Compose.

---

## 3. Las preguntas de la doctora y qué se decidió

La doctora pidió un sistema que la "deje dormir tranquila". Lo tradujimos en cuatro promesas. Cuando dos chocan, gana la de número menor:

1. **Ninguna cita se cruza**, ni por error ni porque dos personas guarden al mismo tiempo.
2. **Ninguna cita se pierde**: nada se borra, todo cambio deja rastro y hay respaldos fuera del servidor.
3. **Doña Rosa lo puede usar sola.**
4. **La información médica solo la ve quien debe.**

A continuación va cada pregunta del enunciado, tal como está escrita, con lo que hace el sistema.

### Sobre las citas

**Si dos recepcionistas intentan dar la misma hora al mismo médico en el mismo segundo, ¿qué debería pasar?**
Gana la primera que guarda. La segunda ve "Ese horario acaba de ser ocupado por otra cita de este médico. Elija otra hora", y la agenda se actualiza sola. Hay tres protecciones:
- una revisión antes de guardar que explica el choque;
- un turno por médico que hace esperar milisegundos a la segunda persona;
- una regla de la base de datos que físicamente no admite dos citas solapadas del mismo médico (ni del mismo paciente), aunque el programa tuviera un error.

**¿Qué pasa si alguien intenta agendar una cita en una fecha que ya pasó?**
No se puede, y la agenda ni muestra horas pasadas como libres. Solo la importación de citas antiguas acepta fechas pasadas, porque son historial, no reservas.

**¿Qué pasa si una cita se cancela dos veces seguidas?**
Nada malo: la segunda vez el sistema dice "esta cita ya estaba cancelada" y no cambia nada. Si dos personas cancelan a la vez, queda una sola cancelación registrada.

**¿Qué pasa con la hora que quedó libre porque alguien canceló?**
Vuelve a aparecer como libre al instante. Si hay pacientes en **lista de espera** para esa clínica o ese médico, el aviso de cancelación lo dice para llamarlos en orden.

**¿Puede un médico atender en dos clínicas a la misma hora? ¿Cómo evitarlo?**
No. El horario semanal de cada médico se define por clínica y el sistema rechaza bloques que se crucen. Al agendar, si a esa hora está en otra clínica, el mensaje lo dice: "Ernesto Salazar a esa hora atiende en Clínica Centro, no en Clínica Norte". Si cambia el horario de un médico, sus citas no se cancelan solas: aparecen en una lista para reprogramarlas, con el teléfono del paciente.

**¿Qué pasa si un día llegan 500 citas? ¿Y si no llega ninguna?**
500 al día es diez veces lo esperado y el sistema lo soporta, con búsquedas paginadas en el servidor e índices. Un día sin citas muestra la agenda vacía con sus horas libres, y los gráficos lo muestran en cero. Además, un doble clic en "Confirmar" o un internet lento no duplican nada: cada intento lleva una clave única y, si llega dos veces, se guarda una sola cita.

### Sobre las personas

**¿Cómo se sabe que el "Juan Pérez" que llama hoy es el mismo de hace un mes? ¿Y si hay dos pacientes con el mismo nombre?**
Mientras se registra a alguien, el sistema busca pacientes parecidos por:
- nombre, aunque esté sin tildes o con una letra cambiada;
- fecha de nacimiento;
- cédula;
- teléfono.

Los muestra con el motivo, y la recepcionista decide entre "Es este paciente" y "No es ninguno". Dos personas pueden llamarse igual, por eso el sistema no decide solo. Cada paciente tiene un código corto (P-00042) fácil de dictar, y dos pacientes no pueden tener la misma cédula. Si igual se crea un duplicado, la dirección puede **unir las dos fichas**: citas, ficha médica y archivos pasan a la que se conserva, y nada se borra.

**¿Qué se hace con un paciente que no tiene cédula, correo ni teléfono?**
Se registra igual.
- Sin documento, se anota el motivo ("recién nacido", "perdió la cédula").
- Sin teléfono ni correo, se exige escribir **cómo ubicarlo** ("avisar a su hija en la tienda de enfrente"), porque si su cita cambia hay que poder avisarle.
- Se le puede imprimir un comprobante con un código QR.
- Un menor de 18 años siempre se registra con su representante.
- Para un adulto mayor que no recuerda su fecha de nacimiento, se guarda una fecha aproximada, marcada como tal.

**¿Qué pasa si un número de teléfono está mal escrito?**
Se acepta como lo dicta la gente ("099 123 4567", "+593 99…") y se guarda siempre en el mismo formato. "12345", o un celular al que le falta un dígito, se rechazan diciendo qué falta.

**¿Quién puede ver qué? ¿Debería una recepcionista ver lo mismo que la doctora?**
No. Configuración de fábrica:

| | Recepción | Médico | Dirección |
|---|---|---|---|
| Agenda, dar y cancelar citas | Solo en las clínicas donde trabaja | Solo su agenda | Todas |
| Datos de contacto de pacientes | Sí | De sus pacientes | Sí |
| Notas clínicas y ficha médica | **No** | De sus pacientes | Sí |
| Panel de cifras | No | Solo las suyas | Sí |
| Usuarios, roles, horarios, importación, bitácora | No | No | Sí |

**La dirección puede cambiarla** desde *Roles y permisos*, creando roles a medida. Por ejemplo, el seed trae una "Coordinación de recepción" que además ve el panel y une duplicados. A cada persona se le asignan también **las clínicas donde trabaja**: una recepcionista de Norte no puede dar ni cambiar citas en Sur aunque escriba la dirección a mano, porque lo revisa la API. La historia de un paciente sí se ve completa, porque su ficha es una sola para las tres clínicas. Un cambio de rol vale de inmediato. Para que nadie quede fuera del sistema:
- el rol Dirección siempre tiene todos los permisos y no se puede editar ni borrar;
- siempre debe quedar al menos una persona activa con ese rol;
- nadie puede quitarse su propio rol ni desactivarse a sí mismo.

### Sobre los datos médicos

**Es información de salud de personas reales. ¿Qué pasaría si alguien ajeno la viera? ¿Cómo se evita?**
Son datos que la Ley Orgánica de Protección de Datos Personales del Ecuador considera sensibles. Una filtración expondría a pacientes y a la clínica. Lo evitamos así:
- **Cuentas:** cada persona entra con su propio usuario; no hay cuentas compartidas. La contraseña inicial se cambia obligatoriamente en el primer ingreso.
- **Bloqueos y sesiones:**
  - tras 5 contraseñas equivocadas, la cuenta se bloquea 15 minutos;
  - la sesión se cierra sola a las 8 horas;
  - la dirección puede cerrar las sesiones de alguien en todos sus equipos, por ejemplo si perdió el celular;
  - al salir se borra la copia de datos guardada en el equipo para trabajar sin internet.
- **Ficha médica:**
  - la ven solo la dirección y los médicos que atienden o atendieron a ese paciente; recepción nunca;
  - cada lectura queda en la bitácora;
  - la bitácora anota qué campo cambió, pero no copia el contenido clínico.
- **Archivos adjuntos:**
  - se verifica el tipo real por su contenido, no por la extensión: un programa renombrado a `.pdf` se rechaza;
  - se abren aislados, sin poder ejecutar nada.
- **Conexión:** en producción todo va por HTTPS y la API no queda expuesta a internet.
- **Enlace de la cita:** muestra solo el primer nombre, la hora, el médico y la clínica. Nada de cédula, teléfono ni datos médicos.
- **Lectura en voz alta:** usa la voz del propio navegador, así que el texto de la pantalla no sale del equipo.
- **Recomendación a la clínica:** un acuerdo de confidencialidad firmado por el personal y un aviso de privacidad para los pacientes. El texto queda a cargo de la clínica.

**Si alguien cambia o borra una cita, ¿cómo se sabe quién lo hizo y cuándo?**
Las citas **no se pueden borrar**, solo cancelar; lo impide la base de datos. Cada cambio queda en la **bitácora** con usuario, fecha, equipo y lo que había antes y después, y la bitácora no la puede editar nadie, ni la dirección. Cada cita muestra además su propio historial, incluidas las cancelaciones hechas por los propios pacientes.

**¿Qué pasa si se borra todo por accidente?**
- Respaldo automático cada 24 horas, verificado para comprobar que no esté dañado. Se conservan los últimos 14.
- Cada respaldo se **copia fuera del servidor**: a un disco externo o a una carpeta sincronizada con Google Drive u OneDrive (`BACKUP_COPY_PATH`).
- Los archivos de la ficha médica se guardan dentro de la base, así que entran en el mismo respaldo.
- Si un respaldo falla, se atrasa o no se copia afuera, **la doctora ve un aviso rojo** en el sistema.
- El procedimiento para restaurar está en la [sección 7](#7-respaldos-y-problemas).

### Sobre el uso real

**¿Podría doña Rosa usar el sistema sin ayuda? ¿Se probó con alguien que no sea técnico?**
Está diseñado para eso:
- **Agendar en 3 pasos**, uno por pantalla: paciente, día y hora (solo se muestran horas libres), y confirmar. Al confirmar aparece la frase para leerle al paciente por teléfono: "María López, con el Dr. Salazar, en Clínica Centro, el viernes 20 de noviembre a las 09:00".
- **La agenda del día** es una cuadrícula de horas por médico, con el resumen arriba y la hora actual marcada.
- **Lectura y escritura fáciles:**
  - letra base de 18 px y botones del tamaño de un dedo;
  - la fecha de nacimiento se escribe con día, mes por nombre y año, no con un calendario;
  - el buscador entiende nombres sin tildes y busca también por cédula o teléfono.
- **El botón de accesibilidad**, en todas las pantallas (también con Alt + A), ofrece:
  - **lectura en voz alta** de la página, de lo seleccionado o de lo que se toca;
  - letra grande o muy grande, y una letra más legible (Atkinson Hyperlegible);
  - alto contraste, tema claro u oscuro;
  - guía de lectura, cursor grande, foco muy visible, enlaces subrayados y menos movimiento.

Se probó en navegador con escenarios automatizados en computadora, celular, modo oscuro y alto contraste. **No se ha probado todavía con doña Rosa ni con otra persona no técnica**, y eso no se puede reemplazar. Recomendamos una sesión de 30 minutos con cada recepcionista antes del lunes de arranque: mirar, sin intervenir, cómo agenda, registra y cancela, y ajustar lo que le cueste.

**Cuando algo sale mal, ¿el mensaje le sirve a una persona normal o solo a un programador?**
A una persona normal. Todos los mensajes están en español sencillo, dicen qué pasó y qué hacer, y marcan el campo exacto a corregir. Si ocurre un error inesperado, el mensaje dice "no se guardó el cambio, intente de nuevo; si sigue, avise con el código X", y el detalle técnico queda solo en el registro del servidor.

**Si alguien se equivoca y presiona el botón equivocado, ¿se puede deshacer?**
Sí:
- **Cancelar** pide el motivo antes de confirmar y después muestra un botón **Deshacer**. Una cita cancelada se puede reactivar mientras su hora no haya pasado y nadie haya ocupado el espacio.
- **Mover una cita** con arrastrar y soltar también tiene Deshacer.
- **Quitar** algo de la lista de espera o un cierre de clínica pide un segundo toque para confirmar.
- **Ficha médica:** una consulta la corrige su autor durante 24 horas. Después queda fija y se agrega una consulta nueva, para que nadie reescriba lo que se le indicó al paciente.

**¿Se puede usar desde un celular? ¿Se entiende con letra pequeña o con poca luz?**
Sí. Funciona en celular: las tablas se convierten en tarjetas y la agenda muestra un médico a la vez. Se puede instalar como aplicación. Tiene modo oscuro automático o manual y alto contraste, y los estados nunca dependen solo del color: llevan ícono y texto.

### Sobre los fallos

**¿Qué pasa en la Clínica Sur cuando se cae el internet a mitad de agendar una cita?**
- Lo que ya estaba abierto (agenda, pacientes, médicos) se sigue viendo sin conexión.
- Una cita nueva o una cancelación hecha sin internet se guarda en el equipo con un **aviso amarillo permanente**. Se envía sola al volver la conexión, sin duplicarse.
- Esa cita **no se muestra como confirmada** hasta enviarse. Si al enviarla otra clínica ya tomó el horario, queda marcada "con conflicto" para llamar al paciente.
- Recomendación adicional: un plan de datos móviles como respaldo en la Clínica Sur.

**¿Qué pasa si el sistema se cae un lunes a las 8 de la mañana?**
Cada parte se reinicia sola si falla, y el sistema reporta su estado en `/api/health`, donde se puede conectar un monitor externo gratuito que avise por correo. Si aun así no hay sistema, la pantalla indica anotar en papel la hora y el teléfono, y registrar al volver. El sistema avisará si alguna de esas horas se ocupó mientras tanto. La guía de problemas está en la [sección 7](#7-respaldos-y-problemas).

**¿Qué pasa si las clínicas tienen horarios distintos, o si cambia la hora por un cambio de horario?**
Cada clínica tiene su horario por día, con varios rangos (mañana y tarde), su duración de turno (30 min en Centro y Norte, 20 en Sur) y sus días cerrados (feriados). Si un cambio de horario o un cierre deja citas afuera, no se cancelan en silencio: aparece la lista para llamar a esos pacientes. Las horas se guardan en formato universal y se convierten con la zona horaria de cada clínica, así que un cambio de hora oficial no desfasa las citas.

### Sobre lo que la clienta no dijo

**¿Hay algo que un sistema de este tipo necesita y la doctora ni siquiera mencionó?**
Sí, y lo agregamos:
- **Recordatorios:** las citas de mañana con un botón de WhatsApp (mensaje listo, con el enlace para cancelar) o de llamada, y la marca de "avisado" con quién lo hizo, para que dos recepcionistas no llamen al mismo paciente. Recordar reduce las inasistencias, que hoy rondan el 12 %. No requiere contratar un servicio.
- **Lista de espera** y marca de **asistió / no asistió**.
- **Ficha médica:**
  - alergias siempre visibles;
  - antecedentes;
  - consultas con signos vitales y diagnóstico con código **CIE-10** (lista de unos 150 frecuentes, búsqueda sin tildes);
  - **receta impresa** en PDF con alergias, firma y sello;
  - **archivos adjuntos** (resultados, imágenes), que el médico puede compartir con el paciente.
- **Portal del paciente:**
  - el paciente adulto crea su cuenta con cédula o pasaporte y pide su cita en línea;
  - la solicitud queda "Por confirmar" con el horario ya reservado, y recepción la acepta o la rechaza;
  - el paciente ve su historial, descarga comprobantes y, en **Mi ficha**, sus diagnósticos, indicaciones, recetas y los archivos compartidos;
  - las notas de examen del médico no se le muestran; la copia completa la pide en la clínica.
- **Avisos internos** (campana):
  - el paciente sabe cuándo su cita se confirmó, se movió o se canceló;
  - recepción sabe cuándo llega una solicitud en línea o un paciente cancela.
- **Página pública de las clínicas:** muestra si cada una está abierta ahora, sus horarios y qué médico atiende dónde y cuándo. Se actualiza sola con los datos del sistema.
- **Panel** de cifras: citas por día, ocupación, horas pico e inasistencias por médico.
- **Importación** de los registros del cuaderno o de Excel.

Dejamos fuera a propósito la **verificación de cédulas contra el Registro Civil**, que es un servicio pagado (ver la siguiente sección). También el **envío automático de WhatsApp**: requiere contratar WhatsApp Business, y entonces los mismos mensajes se enviarían solos.

**¿Hay alguna contradicción en lo que ella pidió? Si la hay, ¿qué se decide y por qué?**
Sí: "que cualquiera pueda cancelar una cita fácilmente" y "no soporto que se pierdan citas". Se resuelve con **cancelar fácil, pero nunca destructivo**:
- **El personal** cancela en dos toques, eligiendo el motivo de una lista.
- **El paciente** también cancela solo: desde el enlace que recibe por WhatsApp, el QR de su comprobante o su portal, hasta 2 horas antes. Después debe llamar, para no dejar huecos que ya no se pueden llenar.
- **En ningún caso la cita se borra:** queda quién, cuándo y por qué, se puede reactivar, y el espacio liberado se ofrece a la lista de espera.

### Sobre la calidad de los datos

**Si alguien escribe una cédula con 9 dígitos, con letras o como "0000000000", ¿el sistema la acepta? ¿Cómo se sabe si un número de cédula es real y no solo lo parece?**
No la acepta. Revisa la longitud, el código de provincia, el tercer dígito y el **dígito verificador**, así detecta números inventados o mal copiados. Comprobar que la cédula *existe* y es *de esa persona* requiere consultar al Registro Civil. Si la clínica contrata ese servicio, se conecta en el mismo validador.

**¿Y un paciente extranjero con pasaporte, o uno que todavía no tiene documento?**
Se elige "Pasaporte", que acepta de 5 a 20 letras o números, o "Sin documento", indicando el motivo.

**¿Se guarda igual un teléfono como "12345" o un correo como "juan@@gmail"?**
No. Se rechazan con un ejemplo del formato correcto. Ambos son opcionales: si no se tienen, se dejan vacíos y se anota cómo ubicar al paciente.

**¿Se puede registrar a un paciente nacido en el año 2090, o con 300 años de edad?**
No. La fecha no puede ser futura, ni pasar de 120 años, ni ser imposible (30 de febrero). En la ficha médica, los signos vitales también tienen rangos que atrapan errores de tipeo, como 700 kg o 3,65 °C.

**Si escriben "MARÍA lópez" o "Maria Lopez" (con espacios de más, sin tildes o en mayúsculas), ¿es el mismo paciente?**
Sí. Se guarda como "María López" y se busca sin tildes ni mayúsculas, así que es el mismo paciente para el buscador y para el detector de duplicados.

**Cuando el sistema rechaza un dato, ¿le dice a la persona qué está mal y cómo corregirlo, sin borrar lo que ya escribió? ¿Qué pasa si alguien pega texto raro (emojis, comillas, código) en un campo?**
El error aparece debajo del campo exacto, en palabras simples, y **no se borra lo escrito**. Los emojis y los caracteres invisibles se quitan; los nombres con números o símbolos se rechazan; y nada de lo escrito se ejecuta como código.

**Datos de prueba.** La pantalla *Importar datos* carga médicos, pacientes y citas desde Excel guardado como CSV:
- Primero muestra una vista previa fila por fila, y nada se guarda hasta confirmar.
- Corrige solo lo seguro y lo informa: el 0 que Excel le quita a cédulas y celulares, y las fechas en formato día/mes/año.
- Rechaza, explicando qué falta, lo que no se puede saber sin inventar: un año de 2 dígitos, un menor sin representante, una cédula de ceros, un médico desconocido.
- Detecta los duplicados y las citas cruzadas del cuaderno, y no los carga.

---

## 4. Supuestos (confirmar con la doctora)

| Supuesto | Motivo |
|---|---|
| Las clínicas están en Ecuador (cédula ecuatoriana, hora de Guayaquil). | El teléfono de contacto del enunciado es +593. |
| Turnos de 30 min en Centro y Norte y de 20 min en Sur. | Se cambian por clínica en cualquier momento. |
| Se puede agendar hasta un año hacia adelante; en línea, hasta 60 días y 2 citas pendientes por paciente. | Evita errores de año (2062 por 2026) y que una persona acapare horarios. |
| El paciente puede cancelar hasta 2 horas antes. | Para que el espacio aún se pueda ofrecer a otro paciente. |
| La cuenta en línea es solo para adultos con cédula o pasaporte; si ya hay una ficha, se vincula solo si coinciden fecha de nacimiento y celular. | Niños, adolescentes y quienes no tienen documento siguen agendando por teléfono, y nadie puede tomar la ficha de otro sabiendo solo su cédula. |
| La Dra. Paredes es la única con rol de dirección y también atiende. | Puede crear otros usuarios de dirección si lo necesita. |
| La lista CIE-10 incluida cubre los diagnósticos frecuentes de medicina familiar. | Se acepta cualquier código bien escrito; si no está en la lista, se avisa para revisarlo. |

---

## 5. Cómo se usa

### Recepción

| Para… | Haga esto |
|---|---|
| **Leer la agenda** | *Agenda del día*: las horas hacia abajo y los médicos hacia los lados, con el resumen del día arriba. En el celular se ve un médico a la vez. |
| **Dar una cita** | Toque una celda "Libre" (o *Nueva cita*) → busque al paciente → elija la hora → lea la frase al paciente → *Confirmar cita*. Con **Enviar por WhatsApp** le llega la confirmación con su enlace para cancelar. |
| **Registrar un paciente** | Dentro de *Nueva cita* o en *Pacientes* → *Registrar paciente*. Si aparecen pacientes parecidos, revise si es uno de ellos. |
| **Cancelar** | Toque la cita → *Cancelar cita* → motivo → confirme. Si fue un error, **Deshacer**. |
| **Cambiar de hora** | Arrastre la cita a una celda "Libre", o toque la cita → *Cambiar día u hora*. |
| **Solicitudes en línea** | Arriba de la agenda: **Aceptar**, o **Rechazar** con una nota que el paciente verá. |
| **Recordar las citas de mañana** | *Recordatorios* → **WhatsApp** o **Llamar**; queda marcado como avisado. |
| **Paciente sin WhatsApp** | En la cita, *Imprimir comprobante*: lleva un código QR para cancelar. |
| **No hay la hora que pide** | *Lista de espera* → *Agregar paciente*. Cuando alguien cancele, el sistema avisa. |
| **Se fue el internet** | Siga trabajando: lo hecho queda "pendiente de enviar" (aviso amarillo) y se envía solo. **No confirme al paciente** una cita pendiente hasta que se envíe. |
| **Avisos (campana)** | Solicitudes en línea y cancelaciones de pacientes de sus clínicas. Al tocar uno se abre la agenda de ese día. |
| **Mis datos y contraseña** | Toque su nombre arriba: *Mi usuario*, con *Cambiar contraseña* y cerrar sesión en otros equipos. |

### Médicos

*Agenda del día* muestra solo su agenda. Al abrir una cita puede marcar si el paciente fue atendido y escribir una nota rápida. Si la hora de la cita ya llegó, **Registrar consulta en la ficha** abre la consulta ligada a esa cita.

**Ficha médica** (*Pacientes* → el paciente → pestaña *Ficha médica*):
- **Alergias** siempre arriba, en rojo. Si no tiene, escriba "Ninguna conocida".
- **Antecedentes**: grupo sanguíneo, enfermedades crónicas, medicación, cirugías, antecedentes familiares y hábitos.
- **Registrar consulta**:
  - signos vitales; el IMC se calcula solo;
  - examen, diagnóstico y **código CIE-10**: escriba "J06.9" o "faringitis" y elija de la lista;
  - plan e indicaciones;
  - **receta**: use *Agregar medicamento* para cada uno. Después, **Imprimir receta** abre el PDF para firmar y sellar.
- **Archivos**: *Adjuntar* sube un PDF o una foto de hasta 10 MB. Marque "Compartir con el paciente" para que lo vea en su portal.
- Una consulta la corrige solo su autor, durante 24 horas.

### Dirección

- **Panel**: citas por día, ocupación por clínica, horas pico e inasistencias por médico. Indica si los respaldos están al día.
- **Clínicas**:
  - *Nueva clínica*, o *Editar* para el horario de cada día, la duración del turno y los datos;
  - *Cerrar un día* para feriados.
  - Si un cambio deja citas afuera, se listan para llamar a esos pacientes.
- **Médicos**:
  - *Editar horario*: qué días y en qué clínica atiende cada uno;
  - *Autodistribuir horario*: propone un reparto parejo entre clínicas, y no se aplica hasta confirmar.
- **Usuarios**:
  - una cuenta por persona, con su rol y las **clínicas donde trabaja**;
  - *Administrar* da una contraseña temporal, desbloquea, cierra sesiones o desactiva la cuenta.
- **Roles y permisos**: crear roles a medida o duplicar uno existente.
- **Sistema**: respaldos, usuarios bloqueados e intentos fallidos de ingreso. Conviene mirarlo cada mañana.
- **Bitácora**: quién hizo qué y cuándo.
- **Importar datos**: primero médicos, luego pacientes, luego citas, siempre con vista previa.
- **Página pública**: se arma sola con los datos del sistema.

### Pacientes (portal)

Desde la página pública, *Agendar en línea* → *Crear mi cuenta* con cédula o pasaporte. En el portal:
- **Inicio**: su próxima cita.
- **Agendar una cita**: clínica, médico, día y hora.
- **Historial**: todas sus citas, cancelarlas y descargar el comprobante en PDF.
- **Mi ficha**: diagnósticos, indicaciones, recetas para imprimir y resultados compartidos.
- **Mi perfil**: celular, correo, contraseña y sesiones.
- **Campana**: le avisa cuando la clínica confirma, rechaza, mueve o cancela su cita.

### Accesibilidad (todas las pantallas)

Botón redondo abajo a la derecha, o **Alt + A**:
- **Leer esta página** en voz alta, o "Leer lo seleccionado". Escape detiene la lectura.
- **Leer al tocar**: lee cualquier texto o botón que se toque.
- Tamaño y tipo de letra, más espacio entre líneas.
- Tema claro u oscuro y alto contraste.
- Guía de lectura, cursor grande, foco muy visible, enlaces subrayados y menos movimiento.

Las preferencias se guardan en cada equipo, y todo funciona también en la página pública.

---

## 6. Instalarlo para las clínicas

Las tres clínicas entran al mismo sistema por internet, así que va en un servidor con un dominio.

1. Apunte el dominio (ej. `agenda.clinicasparedes.ec`) a la IP del servidor.
2. En `.env`:
   - `DOMAIN=agenda.clinicasparedes.ec`
   - `WEB_ORIGIN=https://agenda.clinicasparedes.ec`
   - `COOKIE_SECURE=true`
   - `SEED_MODE=inicial`, para **no** cargar datos de demostración
   - `SEED_DEMO_PASSWORD`: clave temporal del usuario `admin`
   - `BACKUP_COPY_PATH`: carpeta fuera del servidor
3. Levante con HTTPS automático:
   ```bash
   docker compose --profile produccion up -d --build
   ```
4. Ingrese como `admin` con la clave temporal; el sistema pide cambiarla. Después, en orden:
   - revise **Clínicas**;
   - cargue **Médicos**, a mano o con *Importar datos*;
   - cree **Usuarios**, una cuenta por persona;
   - importe los pacientes y las citas futuras.
5. En cada clínica, abra el dominio y use "Instalar aplicación" del navegador, para que abra aunque falle el internet.

**Puesta en marcha recomendada:**
- Capacitación de 30 minutos con cada recepcionista: primero agendar, buscar y cancelar; luego recordatorios.
- Durante la primera semana, el cuaderno sigue en el escritorio como plan B.
- Cada tarde, la doctora revisa el panel y la bitácora.

---

## 7. Respaldos y problemas

- **Respaldo automático:** cada 24 horas, comprimido y verificado, en `./backups` (se conservan 14), con copia en `BACKUP_COPY_PATH`.
- **Respaldo inmediato:** `docker compose restart backup`.

**Restaurar** (primero en una base aparte, para comparar):

```bash
docker compose exec db createdb -U clinagenda clinagenda_restaurada
gunzip -c backups/clinagenda-AAAAMMDD-HHMMSS.sql.gz | docker compose exec -T db psql -U clinagenda -d clinagenda_restaurada
```

Para reemplazar la base principal:

1. Detenga `api` y `web`.
2. Renombre las bases con `ALTER DATABASE … RENAME TO …`.
3. Vuelva a levantar.

| Síntoma | Qué revisar |
|---|---|
| Nadie puede entrar | `docker compose ps`: los servicios deben decir *healthy*. Luego `docker compose logs api --tail 50`. |
| Un mensaje dice "avise con el código XXXX" | Busque ese código en `docker compose logs api`. |
| Aviso rojo de respaldos | Que el disco o la carpeta externa estén conectados; `docker compose logs backup`. |
| La Clínica Sur no ve la agenda sin internet | Debe haberla abierto al menos una vez con conexión ese día. |

---

## 8. Para programadores

```bash
npm install && npm run build:schemas
npm test -w @clinagenda/schemas        # validadores, reglas del paciente, ficha médica y CIE-10 (45 pruebas)

# Pruebas de punta a punta con una base aparte
docker run -d --name clinagenda-test -e POSTGRES_USER=clinagenda -e POSTGRES_PASSWORD=test -e POSTGRES_DB=clinagenda -p 5432:5432 postgres:17-alpine
cd apps/api
export DATABASE_URL=postgresql://clinagenda:test@localhost:5432/clinagenda JWT_SECRET=$(openssl rand -hex 32)
npx prisma migrate deploy && npm run seed && npm run test:e2e   # 60 pruebas: citas, accesos, portal y ficha médica

# Desarrollo con recarga
npm run dev:api   # API en :4000, Swagger en /api/docs
npm run dev:web   # Web en :3000
```

| Decisión técnica | Por qué |
|---|---|
| Validación escrita una sola vez en `packages/schemas` | La cédula, el teléfono o una fecha se validan igual en la web y en el servidor, con los mismos mensajes. Swagger sale de los mismos esquemas, así que no se desactualiza. |
| Reglas críticas dentro de PostgreSQL | No cruzar citas, no borrarlas y no editar la bitácora no dependen de que el programa no tenga errores. |
| Migraciones a mano sobre `prisma migrate diff` | Las restricciones `EXCLUDE`, los triggers y los `CHECK` no los expresa Prisma; quedan versionados en `prisma/migrations`. |
| Aplicación instalable con caché sin conexión | Por la Clínica Sur. |
| Archivos clínicos dentro de la base, no en disco | Entran en el respaldo diario y se restauran juntos. Para una clínica pequeña, con el límite de 10 MB por archivo, es lo más seguro. |
| Avisos internos (campana), no correo ni SMS | No dependen de servicios externos. Se guardan en la misma transacción que el cambio: no hay aviso de algo que no pasó. |
| Lectura en voz alta con la Web Speech API | Sin servicios externos ni costo, y el texto no sale del equipo. |
| Página pública con GSAP y Lenis atados al scroll | Las animaciones avanzan y retroceden con la persona. Con "menos movimiento" la página se lee completa y quieta, y los textos siempre están en el HTML. |

**Datos y credenciales:** todos los datos de demostración son inventados. No se suben datos reales, contraseñas ni llaves: ver `.gitignore` y `.env.example`.
