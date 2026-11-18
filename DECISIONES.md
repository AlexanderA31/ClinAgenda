# DECISIONES — ClinAgenda

Este documento explica qué preguntas de la clienta se resolvieron, cómo, cuáles quedaron fuera y por qué, y qué supusimos que la Dra. Paredes necesitaba. Cada respuesta indica su estado:

- ✅ **Resuelto**: implementado y probado.
- 🟡 **Parcial**: resuelto en parte; se explica qué falta.
- ⛔ **Fuera de alcance**: no se hizo; se explica cómo se haría.

---

## 0. Lo que entendimos del encargo

La Dra. Paredes no pidió funciones: pidió **dormir tranquila**. Lo tradujimos en cuatro promesas, en este orden de prioridad:

1. **Ninguna cita se cruza.** Ni por error humano ni por dos personas guardando al mismo tiempo.
2. **Ninguna cita se pierde.** Nada se borra; todo cambio deja rastro; hay respaldos diarios.
3. **Doña Rosa lo puede usar sola.** Letra grande, pocos pasos, mensajes en su idioma.
4. **La información médica no la ve quien no debe.**

Cuando dos objetivos chocaron, ganó el de número menor.

### Supuestos que hicimos (para confirmar con la clienta)

| Supuesto | Por qué |
|---|---|
| Las clínicas están en Ecuador (cédula ecuatoriana, zona `America/Guayaquil`). | El número de consultas es +593. |
| Los pacientes **no** usan el sistema; lo usan recepción, médicos y dirección. | “Cualquiera pueda cancelar” lo interpretamos como cualquier persona del personal. Ver §6. |
| Turnos de 30 min en Centro y Norte y de 20 min en Sur (configurable por clínica). | Sur atiende más medicina general y odontología. |
| Se puede agendar hasta 1 año hacia adelante. | Evita errores de año (2062 en vez de 2026). |
| Un menor de 18 años siempre viene con representante. | Para avisar cambios y por responsabilidad legal. |
| La Dra. Paredes también atiende (tiene ficha de médico) y es la única con rol de dirección. | Es dueña y médica. |

---

## 1. Sobre las citas

| Pregunta | Estado | Qué decidimos |
|---|---|---|
| Dos recepcionistas dan la misma hora al mismo médico en el mismo segundo | ✅ | **Gana la primera; la segunda recibe un mensaje claro.** Tres capas: (1) antes de guardar se revisa el horario y se da un mensaje con el detalle; (2) un *candado por médico* en la base (`pg_advisory_xact_lock`) hace que la segunda espere milisegundos y vea la cita ya creada; (3) una restricción `EXCLUDE` de PostgreSQL impide físicamente dos citas solapadas del mismo médico, aunque hubiera un error en el código. Probado con dos peticiones simultáneas (prueba e2e). En la primera versión la base resolvía el choque correctamente pero la segunda persona veía “error interno”; por eso se agregó el candado. |
| Agendar en una fecha que ya pasó | ✅ | Se rechaza: “No se puede agendar en una fecha u hora que ya pasó”. La agenda ni siquiera muestra horas pasadas como libres. Excepción: la importación de citas **históricas** sí acepta fechas pasadas (son registros, no reservas). |
| Cancelar dos veces seguidas | ✅ | No es un error. La segunda vez responde “esta cita ya estaba cancelada; no se hizo ningún cambio”. La cancelación usa una actualización condicional, así que si dos personas cancelan a la vez solo una queda registrada como autora. |
| La hora que quedó libre por una cancelación | ✅ | Vuelve a aparecer como libre de inmediato. Si hay pacientes en **lista de espera** para esa clínica/médico, el aviso de cancelación lo dice y recepción los llama en orden de llegada. 🟡 No se avisa automáticamente al paciente (no hay SMS/WhatsApp, ver §6). |
| ¿Puede un médico atender en dos clínicas a la misma hora? | ✅ | No. (a) Al configurar el horario semanal del médico, el sistema rechaza horarios que se crucen entre clínicas. (b) Al agendar, se verifica que a esa hora el médico esté asignado a *esa* clínica y el mensaje dice dónde está (“a esa hora atiende en Clínica Centro”). (c) La restricción de la base es por médico, sin importar la clínica. |
| ¿Y si un día llegan 500 citas? ¿Y si no llega ninguna? | ✅ | 500 citas/día es ~10 veces lo esperado (400 pacientes al mes). Las tablas paginan del lado del servidor, hay índices por médico/clínica/fecha y la agenda carga un día a la vez. Si no hay citas, las pantallas muestran un estado vacío que explica qué hacer, y los gráficos muestran el día en cero en lugar de desaparecer. |
| Reprogramar | ✅ | “Cambiar día u hora” mueve la cita (no crea otra) aplicando las mismas reglas, y queda en su historial. |
| Doble clic en “Confirmar” o reintento por internet lento | ✅ | Cada intento de agendar lleva una clave única (`Idempotency-Key`). Si la misma petición llega dos veces, el servidor devuelve la misma cita en lugar de crear otra. Probado. |

## 2. Sobre las personas

| Pregunta | Estado | Qué decidimos |
|---|---|---|
| ¿El “Juan Pérez” de hoy es el mismo de hace un mes? ¿Dos con el mismo nombre? | ✅ | Cada paciente tiene un **código** (P-00042) además del documento. Al registrar, mientras se escribe, el sistema busca parecidos combinando: nombre sin tildes ni mayúsculas (búsqueda por trigramas, tolera “Lopes” por “López”), fecha de nacimiento, documento y teléfono. Muestra los candidatos con el motivo (“misma fecha de nacimiento”) y la recepcionista decide: “Es este paciente” o “No es ninguno”. **El sistema no fusiona solo**: dos personas homónimas son posibles. Si igual se crea un duplicado, la dirección puede **unir fichas** (las citas pasan a la ficha que se conserva y la otra queda marcada, no se borra). |
| Paciente sin cédula, correo ni teléfono | ✅ | Se registra igual. Sin documento se pide el motivo (“recién nacido”, “perdió la cédula”). Sin teléfono ni correo se exige una **nota de cómo ubicarlo** (“avisar a su hija en la tienda”), porque si la cita cambia hay que poder avisarle. |
| Teléfono mal escrito | ✅ | Se valida con la librería de Google (`libphonenumber`): “099 123 4567”, “0991234567” y “+593 99 123 4567” se guardan igual (+593991234567). “12345” se rechaza diciendo cuántos números faltan. |
| ¿Quién puede ver qué? | ✅ | Tres roles. **Recepción**: agenda de todas las clínicas, pacientes y datos de contacto; no ve notas clínicas ni la bitácora. **Médico**: solo su agenda y los pacientes que tienen o tuvieron cita con él; escribe notas clínicas. **Dirección**: todo, más bitácora, usuarios, importación y panel. Los permisos se aplican en la API (no solo ocultando botones). |
| Niños y adultos mayores | ✅ | Menores de 18 requieren representante (nombre, parentesco, teléfono). Para adultos mayores que no recuerdan su fecha de nacimiento se puede marcar “fecha aproximada”. |

## 3. Sobre los datos médicos

| Pregunta | Estado | Qué decidimos |
|---|---|---|
| ¿Qué pasaría si alguien ajeno ve la información? ¿Cómo se evita? | 🟡 | Hecho: cada persona tiene usuario propio (sin cuentas compartidas); contraseñas con hash Argon2; bloqueo de 15 min tras 5 intentos fallidos; sesión en cookie `httpOnly` que expira a las 8 horas; contraseña inicial obligatoria de cambiar; la nota clínica viaja solo al médico de la cita y a dirección; lecturas de notas clínicas quedan en bitácora; cabeceras de seguridad y límite de peticiones. **Falta para producción real**: servir con HTTPS (poner un proxy como Caddy delante y `COOKIE_SECURE=true`), cifrado del disco del servidor, y un acuerdo de confidencialidad del personal. Ecuador tiene la Ley Orgánica de Protección de Datos Personales (2021): los datos de salud son sensibles; habría que informar a los pacientes y pedir su consentimiento. |
| Si alguien cambia o borra una cita, ¿cómo se sabe quién y cuándo? | ✅ | **Bitácora** con usuario, fecha, IP, valores antes y después, escrita en la misma transacción que el cambio (o quedan los dos o ninguno). La base tiene un *trigger* que impide modificar o borrar la bitácora, incluso a la propia aplicación. Además cada cita muestra su **historial** (creada, cancelada, reactivada…). Las citas **no se pueden borrar**: otro trigger lo impide; solo se cancelan. |
| ¿Qué pasa si se borra todo por accidente? | 🟡 | Respaldo automático diario (`pg_dump` comprimido), se conservan 14 días, con instrucciones de restauración probadas en una base aparte (INSTRUCCIONES §5). **Falta**: copiar los respaldos **fuera** del servidor (nube o disco externo); si el servidor se daña, hoy los respaldos se pierden con él. Es lo primero que haríamos después de la entrega. |

## 4. Sobre el uso real

| Pregunta | Estado | Qué decidimos |
|---|---|---|
| ¿Podría doña Rosa usarlo sin ayuda? ¿Se probó con alguien no técnico? | 🟡 | Diseño: letra base de 18 px con botón “Letra grande”; fuente **Atkinson Hyperlegible** (creada para personas con baja visión); botones de al menos 48 px; agendar en 3 pasos, uno por pantalla; fecha de nacimiento en día / mes (por nombre) / año en lugar de un calendario; frase final para leer al paciente; buscador que acepta nombres sin tildes. **Prueba con una persona no técnica: pendiente**, a realizar por el equipo antes de la defensa y anotar aquí (ver plantilla §9). No vamos a inventar un resultado. |
| Cuando algo sale mal, ¿el mensaje sirve a una persona normal? | ✅ | Todos los errores de la API tienen la misma forma y un mensaje en español escrito para recepción, con el campo exacto a corregir. Los errores inesperados dicen “no se guardó el cambio, intente de nuevo; si sigue, avise con el código X”; el detalle técnico queda solo en el registro del servidor. La landing muestra el ejemplo real: el error de PostgreSQL frente al mensaje que ve Rosa. |
| Si alguien presiona el botón equivocado, ¿se puede deshacer? | ✅ | Cancelar muestra un aviso con **Deshacer** y además la cita cancelada se puede reactivar mientras su hora no haya pasado y nadie haya ocupado el espacio. Las acciones destructivas piden confirmación con el motivo. Cambiar de hora también se puede revertir moviéndola de nuevo. |
| ¿Se puede usar desde un celular? ¿Con letra pequeña o poca luz? | ✅ | Diseño adaptable (probado a 390 px de ancho sin desplazamiento lateral); en celular las tablas se convierten en tarjetas. Tema oscuro automático o manual. Contraste revisado; los estados nunca dependen solo del color (ícono + texto). |

## 5. Sobre los fallos

| Pregunta | Estado | Qué decidimos |
|---|---|---|
| Se cae el internet en la Clínica Sur a mitad de agendar | 🟡 | Hecho: la app es instalable (PWA) y su *service worker* guarda las pantallas y la última copia de la agenda, pacientes y médicos consultados; sin conexión se siguen viendo. Si se intenta **agendar** sin internet, la cita se guarda en el equipo como **“pendiente de enviar”** (aviso amarillo permanente, nunca como confirmada) y se envía sola al volver la conexión, con su clave de idempotencia para no duplicarse. Si al enviarla el horario ya fue tomado, queda marcada “con conflicto” para que recepción llame al paciente. **No hecho**: cancelar o editar sin conexión (se muestra el aviso de que no hay internet). Riesgo aceptado: dos clínicas podrían prometer la misma hora mientras Sur está desconectada; por eso la cita pendiente **no** se confirma al paciente hasta sincronizar. Recomendación adicional (no técnica): un plan de datos móviles como respaldo en Sur. |
| ¿Si el sistema se cae un lunes a las 8 de la mañana? | 🟡 | Los contenedores se reinician solos (`restart: unless-stopped` y *healthchecks*); si la base no responde, `/api/health` lo reporta. La pantalla sin conexión indica anotar en papel hora y teléfono y registrar al volver. **Falta**: monitoreo con alerta al celular de la doctora, y un servidor de respaldo. |
| Horarios distintos por clínica o cambio de horario (DST) | ✅ | Cada clínica tiene su propio horario por día de la semana, su duración de turno y días cerrados (feriados). Las fechas se guardan en UTC y se convierten con la zona IANA de cada clínica, así un cambio de hora o una clínica en otra zona (Galápagos) no desfasa las citas. Ecuador no tiene horario de verano hoy, pero si lo adoptara bastaría con actualizar la base de zonas horarias. Al cerrar un día, el sistema **no cancela citas en silencio**: avisa cuántas hay para que recepción llame a esos pacientes. |

## 6. Lo que la clienta no dijo

| Tema | Estado | Decisión |
|---|---|---|
| **Contradicción: “cualquiera pueda cancelar fácilmente” vs. “no soporto que se pierdan citas”.** | ✅ | Resolvimos que **cancelar es fácil pero nunca destructivo**: cualquier usuario del personal cancela en dos toques eligiendo un motivo de una lista; la cita no se borra, queda quién/cuándo/por qué, y se puede deshacer. Así una cancelación por error no “pierde” la cita. |
| ¿“Cualquiera” incluye al paciente? | ⛔ | No hay portal de pacientes. Lo haríamos con un enlace único por cita enviado por SMS/WhatsApp que permita cancelar (no ver datos), con límite de tiempo. Requiere un proveedor de mensajería (costo mensual), por eso lo dejamos para que la doctora decida. |
| Recordatorios a pacientes | ⛔ | No implementado. Reducen las inasistencias (el panel muestra ~12 %). Se haría con la API de WhatsApp Business un día antes. |
| Lista de espera | ✅ | No lo pidió, pero si no hay hora disponible el paciente no debería perderse. |
| Inasistencias (“no vino”) | ✅ | Se marca asistencia; el panel muestra el porcentaje por médico. |
| Feriados y cierres | ✅ | Ver §5. |
| Panel para la dirección | ✅ | Citas por día y estado, ocupación por clínica, horas pico (para decidir cuántas recepcionistas poner), motivos de cancelación y por médico. Un médico ve solo sus cifras. |
| Protección de datos (LOPDP) | 🟡 | Ver §3. |
| Historia clínica completa | ⛔ | Fuera de alcance a propósito: el pedido es una agenda. Solo hay una nota clínica breve por cita. Una historia clínica tiene requisitos legales propios. |

## 7. Sobre la calidad de los datos

| Pregunta | Estado | Qué hace el sistema |
|---|---|---|
| Cédula con 9 dígitos, con letras o “0000000000”. ¿Cómo saber si es real? | ✅ | Valida longitud, solo números, provincia (01–24 o 30), tercer dígito y **dígito verificador módulo 10**. Cada falla tiene su mensaje. **Limitación honesta**: esto prueba que el número es *válido*, no que *exista* ni que sea de esa persona; para eso habría que consultar al Registro Civil (servicio pagado, fuera de alcance). La base además impide que dos pacientes activos tengan el mismo documento. |
| Paciente extranjero con pasaporte, o sin documento aún | ✅ | Tipo de documento: cédula, pasaporte (5–20 letras/números) o “sin documento” con motivo. |
| ¿Se guarda igual “12345” o “juan@@gmail”? | ✅ | No. Ambos se rechazan con un ejemplo del formato correcto. Teléfono y correo son opcionales: si no se tienen, se dejan vacíos, pero no se aceptan mal escritos. |
| ¿Nacido en 2090 o con 300 años? | ✅ | No: la fecha no puede ser futura ni dar más de 120 años, y debe existir (no 30 de febrero). La base también tiene un límite como red de seguridad. |
| “MARÍA lópez” vs “Maria Lopez” | ✅ | Se guarda con formato uniforme (“María López”, respetando “de”, “del”, “la”) y con una clave de búsqueda sin tildes ni mayúsculas, así ambas formas encuentran al mismo paciente y el detector de duplicados las compara bien. |
| Cuando rechaza un dato, ¿explica y conserva lo escrito? ¿Emojis, comillas, código pegado? | ✅ | El error aparece debajo del campo y el formulario no se borra. Los mismos schemas Zod validan en la web y en la API (mismos mensajes). Emojis, caracteres invisibles y de control se eliminan antes de validar; nombres con números o símbolos (`<script>`) se rechazan; React escapa todo al mostrar y la base usa consultas parametrizadas (sin inyección SQL). |

## 8. Datos de prueba (martes)

🟡 El importador está listo para archivos CSV (separados por `;` o `,`, en UTF-8 o Latin-1, como los exporta Excel). Reconoce varios nombres de columna (`cedula`/`documento`/`ci`, `telefono`/`celular`…), corrige solo lo seguro e informa cada corrección:

- cédula o celular al que Excel le quitó el 0 inicial (se verifica que con el 0 la cédula sea válida);
- fechas `dd/mm/aaaa` → `aaaa-mm-dd` (años de 2 dígitos se **rechazan**: no adivinamos si es 1926 o 2026);
- correo o teléfono inválidos → se dejan vacíos y se avisa, en lugar de perder al paciente;
- paciente sin contacto → se marca “completar en la próxima visita”;
- duplicados dentro del archivo y contra la base → no se crean;
- citas que se cruzan entre sí (el problema del cuaderno) → se rechazan indicando con cuál.

Lo que **no** se adivina (menor sin representante, cédula de solo ceros, médico o clínica desconocidos) se rechaza con el motivo para que una persona lo complete. Siempre hay vista previa antes de guardar. *Cuando llegue el archivo real documentaremos aquí qué encontramos y qué ajustes hicimos.*

## 9. Prueba con una persona no técnica (plantilla — completar por el equipo)

| Campo | Resultado |
|---|---|
| Persona (edad, experiencia con computadoras; sin datos que la identifiquen) | *pendiente* |
| Tarea 1: agendar una cita a un paciente existente | *¿lo logró sola? ¿cuánto tardó? ¿dónde dudó?* |
| Tarea 2: registrar un paciente nuevo sin cédula | *pendiente* |
| Tarea 3: cancelar una cita y deshacerlo | *pendiente* |
| Qué cambiamos después | *pendiente* |

## 10. Cambio de planes (miércoles/jueves)

*Se registrará aquí el mensaje de la clienta, qué decidimos y en qué commits/rama se ve.*

La arquitectura está pensada para absorber cambios: las reglas de negocio viven en un solo lugar (`packages/schemas` para validaciones compartidas, `apps/api/src/modules/*` por tema) y la base de datos se cambia con migraciones versionadas, sin perder datos.

## 11. Decisiones técnicas y por qué

| Decisión | Motivo |
|---|---|
| Monorepo: `packages/schemas` (Zod) compartido por API (NestJS) y web (Next.js) | Una regla (p. ej. la cédula) se escribe una vez y valida igual en el navegador y en el servidor. Swagger se genera de esos mismos schemas. |
| PostgreSQL con restricciones `EXCLUDE`, triggers y transacciones | Las reglas críticas (no cruzar citas, no borrar, bitácora inmutable) no dependen de que el código no tenga errores. |
| La web reenvía `/api` a la API (mismo origen) | Cookie de sesión `httpOnly` sin configuraciones CORS frágiles y caché sin conexión posible. |
| Fuentes alojadas en la app (no Google Fonts) | Cargan aunque falle internet externo; además `next/font` falló al construir. |
| Docker Compose con respaldos | Un solo comando para levantar todo; reinicio automático. |
| npm workspaces en lugar de pnpm/Turborepo (cambio respecto al plan inicial) | El equipo de desarrollo no tenía pnpm instalado; npm viene con Node y simplifica las instrucciones. |
| Uso de IA | Se usó un asistente de IA (Claude) para escribir gran parte del código. El equipo revisó cada módulo y debe poder explicarlo; los commits describen qué se hizo y por qué. |

## 12. Seguridad del repositorio

- `.env`, respaldos y `node_modules` están en `.gitignore`. Solo se sube `.env.example` con valores de ejemplo.
- Todos los datos de demostración son **inventados** (nombres generados al azar y cédulas calculadas para ser válidas, no de personas reales).
- No se ha subido ninguna credencial real. Si ocurriera, se anotará aquí junto con la rotación de la clave.

## 13. Qué haríamos con más tiempo (en orden)

1. Copia de respaldos fuera del servidor y monitoreo con alertas.
2. Prueba con doña Rosa real y ajustes según lo observado.
3. HTTPS con proxy (Caddy) y despliegue en un servidor administrado.
4. Recordatorios por WhatsApp y enlace de cancelación para pacientes.
5. Cancelar/editar sin conexión con resolución de conflictos.
6. Edición de horarios de médicos desde la interfaz (hoy se ven; se editan por API/Swagger).
