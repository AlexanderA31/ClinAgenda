# DECISIONES — ClinAgenda

Este documento es para la Dra. Paredes y para quien administre el sistema. Explica, para cada preocupación que la doctora planteó, **qué decidimos y qué hace el sistema**, y deja escrito lo que se supuso y lo que conviene revisar con el tiempo.

La doctora pidió un sistema que la “deje dormir tranquila”. Lo tradujimos en cuatro promesas, en este orden de prioridad (cuando dos chocan, gana la de número menor):

1. **Ninguna cita se cruza**, ni por error ni porque dos personas guarden al mismo tiempo.
2. **Ninguna cita se pierde**: nada se borra, todo cambio deja rastro y hay respaldos fuera del servidor.
3. **Doña Rosa lo puede usar sola.**
4. **La información médica solo la ve quien debe.**

---

## 1. Las citas

**Dos recepcionistas dan la misma hora al mismo médico en el mismo segundo.**
Gana la primera que guarda; la segunda ve “Ese horario acaba de ser ocupado por otra cita de este médico. Elija otra hora” y la agenda se actualiza sola. Hay tres protecciones: una revisión antes de guardar que explica el choque, un turno por médico que hace esperar milisegundos a la segunda persona, y una regla en la base de datos que físicamente no admite dos citas solapadas del mismo médico, aunque el programa tuviera un error.

**Agendar en una fecha que ya pasó.**
No se puede. La agenda ni muestra horas pasadas como libres. Solo la importación de citas antiguas acepta fechas pasadas, porque son historial, no reservas.

**Cancelar dos veces seguidas.**
No pasa nada malo: la segunda vez el sistema dice “esta cita ya estaba cancelada” y no cambia nada. Si dos personas cancelan a la vez, queda una sola cancelación registrada.

**La hora que quedó libre.**
Vuelve a aparecer como libre al instante, y si hay pacientes en **lista de espera** para esa clínica o ese médico, el aviso de cancelación lo dice para llamarlos en orden.

**Un médico en dos clínicas a la misma hora (Dr. Salazar).**
Imposible. Su horario semanal se define por clínica y el sistema rechaza bloques que se crucen. Al agendar, si a esa hora está en otra clínica, el mensaje lo dice: “Ernesto Salazar a esa hora atiende en Clínica Centro, no en Clínica Norte”.

**Si cambia el horario de un médico o deja de atender.**
Las citas que ya tenía no se cancelan solas: el sistema muestra la lista de citas que quedaron fuera de su horario, con el teléfono del paciente, para reprogramarlas.

**500 citas en un día, o ninguna.**
500 al día es diez veces lo esperado y el sistema lo soporta (búsquedas paginadas e índices). Un día sin citas muestra la agenda vacía con sus horas libres; los gráficos muestran ese día en cero.

**Doble clic en “Confirmar” o internet lento.**
Cada intento de agendar lleva una clave única: si llega dos veces, se guarda una sola cita.

## 2. Las personas

**¿El “Juan Pérez” de hoy es el mismo de hace un mes? ¿Dos con el mismo nombre?**
Mientras se registra a alguien, el sistema busca pacientes parecidos (nombre aunque esté sin tildes o con una letra cambiada, fecha de nacimiento, cédula, teléfono) y los muestra con el motivo. La recepcionista decide “Es este paciente” o “No es ninguno”: dos personas pueden llamarse igual, por eso el sistema no decide solo. Cada paciente tiene además un código corto (P-00042) fácil de dictar. Si igual se crea un duplicado, la dirección puede **unir las dos fichas**: las citas pasan a la que se conserva y nada se borra.

**Paciente sin cédula, correo ni teléfono.**
Se registra igual. Sin documento se anota el motivo (“recién nacido”, “perdió la cédula”). Sin teléfono ni correo se exige escribir **cómo ubicarlo** (“avisar a su hija en la tienda de enfrente”), porque si su cita cambia hay que poder avisarle. Se le puede imprimir un comprobante.

**Teléfono mal escrito.**
Se acepta como lo dicta la gente (“099 123 4567”, “+593 99…”) y se guarda siempre igual. “12345” o un celular con un número de menos se rechazan diciendo qué falta.

**¿Quién puede ver qué?**

| | Recepción | Médico | Dirección |
|---|---|---|---|
| Agenda de las tres clínicas, dar y cancelar citas | Sí | Solo la suya | Sí |
| Datos de contacto de pacientes | Sí | Solo de sus pacientes | Sí |
| Notas clínicas | **No** | Solo de sus citas | Sí |
| Panel de cifras | No | Solo las suyas | Sí |
| Usuarios, importación, horarios de médicos, bitácora | No | No | Sí |

Los permisos se aplican en el servidor, no solo ocultando botones.

**Niños y adultos mayores.** Un menor de 18 años siempre se registra con su representante. Para quien no recuerda su fecha de nacimiento se guarda una fecha aproximada, marcada como tal.

## 3. Los datos médicos

**¿Qué pasaría si alguien ajeno ve la información? ¿Cómo se evita?**
- Cada persona entra con **su propio usuario**; no hay cuentas compartidas. La contraseña inicial se cambia obligatoriamente al primer ingreso.
- Tras 5 contraseñas equivocadas el usuario se bloquea 15 minutos; la dirección puede desbloquearlo.
- La sesión se cierra sola a las 8 horas. Al salir se borra del equipo la copia de datos guardada para trabajar sin internet.
- Las notas clínicas solo viajan al médico de la cita y a la dirección, y cada lectura queda registrada.
- En producción el sistema funciona solo por **HTTPS** (conexión cifrada) y la API no queda expuesta a internet.
- El enlace que recibe el paciente muestra únicamente su primer nombre, la hora, el médico y la clínica: nada de cédula, teléfono ni datos médicos.

Son datos de salud, que la Ley Orgánica de Protección de Datos Personales del Ecuador considera sensibles. Recomendamos además un acuerdo de confidencialidad firmado por el personal y un aviso de privacidad para los pacientes (texto a cargo de la clínica).

**Si alguien cambia o borra una cita, ¿cómo se sabe quién y cuándo?**
Las citas **no se pueden borrar**, solo cancelar. Cada cambio queda en la **bitácora** con usuario, fecha, equipo y lo que había antes y después; la bitácora no la puede editar nadie, ni la dirección. Cada cita muestra además su propio historial.

**¿Qué pasa si se borra todo por accidente?**
- Respaldo automático cada 24 horas, verificado para comprobar que no esté dañado, conservando los últimos 14.
- Cada respaldo se **copia fuera del servidor**: a un disco externo o a una carpeta sincronizada con Google Drive u OneDrive (variable `BACKUP_COPY_PATH`).
- Si un respaldo falla, se atrasa o no se copia afuera, **la doctora ve un aviso rojo** en el sistema. Si está bien, el panel lo confirma.
- El procedimiento para restaurar está en INSTRUCCIONES.

## 4. El uso real

**¿Podría doña Rosa usarlo sin ayuda?**
Lo diseñamos para eso:
- Letra base grande (18 px) con un botón “Letra grande” para agrandarla más; tipografía creada para personas con baja visión.
- Botones del tamaño de un dedo; agendar en 3 pasos, uno por pantalla: paciente, día y hora (solo se muestran horas libres), confirmar.
- Al confirmar aparece una frase para leerle al paciente por teléfono: “María López, con el Dr. Salazar, en Clínica Centro, el viernes 20 de noviembre a las 09:00”.
- La fecha de nacimiento se escribe en día, mes (por nombre) y año, no con un calendario.
- El buscador entiende nombres sin tildes y busca también por cédula o teléfono.

Recomendamos una sesión de 30 minutos con cada recepcionista antes del lunes de arranque, mirando sin intervenir cómo agenda, registra y cancela, y ajustando lo que cueste (ver §8).

**Cuando algo sale mal, ¿el mensaje sirve a una persona normal?**
Sí. Todos los mensajes están en español sencillo, dicen qué pasó y qué hacer, y marcan el campo exacto a corregir. Si ocurre un error inesperado, el mensaje dice “no se guardó el cambio, intente de nuevo; si sigue, avise con el código X”; el detalle técnico queda solo para soporte.

**Si alguien presiona el botón equivocado, ¿se puede deshacer?**
Sí. Cancelar muestra un botón **Deshacer**, y una cita cancelada se puede reactivar mientras su hora no haya pasado y nadie haya ocupado el espacio. Cancelar pide elegir el motivo antes de confirmar. Un cambio de hora se revierte moviéndola de nuevo.

**¿Desde un celular? ¿Con letra pequeña o poca luz?**
Sí. Funciona en celular (las tablas se convierten en tarjetas) y tiene modo oscuro automático o manual. Los estados nunca dependen solo del color: llevan ícono y texto.

## 5. Los fallos

**Se cae el internet en la Clínica Sur a mitad de agendar.**
- Lo ya abierto (agenda, pacientes, médicos) se sigue viendo sin conexión.
- Una cita nueva o una cancelación hecha sin internet se guarda en el equipo con un **aviso amarillo permanente** y se envía sola al volver la conexión, sin duplicarse.
- Una cita guardada así **no se muestra como confirmada** hasta enviarse. Si al enviarla el horario ya lo tomó otra clínica, queda marcada “con conflicto” para llamar al paciente.
- Recomendación adicional: un plan de datos móviles como respaldo en la Clínica Sur.

**El sistema se cae un lunes a las 8 de la mañana.**
Cada parte se reinicia sola si falla, y el sistema reporta su estado en `/api/health` (para conectar un monitor externo gratuito que avise por correo o mensaje). Si aun así no hay sistema, la pantalla indica anotar en papel hora y teléfono y registrar al volver; el sistema avisará si alguna de esas horas se ocupó mientras tanto.

**Horarios distintos por clínica o cambio de hora.**
Cada clínica tiene su horario por día, su duración de turno (30 min en Centro y Norte, 20 en Sur) y sus días cerrados (feriados). Al cerrar un día, el sistema no cancela citas en silencio: avisa cuántas hay para llamar a esos pacientes. Las horas se guardan en un formato universal y se convierten con la zona horaria de cada clínica; un cambio de hora oficial no desfasa las citas.

## 6. Lo que la doctora no dijo

**La contradicción: “cualquiera pueda cancelar fácilmente” vs. “no soporto que se pierdan citas”.**
Cancelar es fácil pero nunca destructivo:
- **El personal** cancela en dos toques eligiendo el motivo de una lista.
- **El paciente** también puede cancelar solo: recibe por WhatsApp (o impreso, con código QR) un enlace a su cita y la cancela ahí, sin llamar, hasta 2 horas antes. Después de eso debe llamar, para no dejar huecos que ya no se pueden llenar.
- En ningún caso la cita se borra: queda quién, cuándo y por qué, se puede reactivar, y el espacio liberado se ofrece a la lista de espera.

**Recordatorios.** La pantalla “Recordatorios” muestra las citas de mañana con un botón de WhatsApp (mensaje listo con el enlace para cancelar) o de llamada, y una marca de “avisado” con el nombre de quien lo hizo, para que dos recepcionistas no llamen al mismo paciente. Recordar reduce las inasistencias (hoy rondan el 12 %) y libera a tiempo los espacios. No requiere contratar un servicio: se abre WhatsApp con el texto escrito y se presiona Enviar. Si más adelante se contrata WhatsApp Business, los mismos mensajes se pueden enviar automáticamente.

**Otras cosas que agregamos porque una agenda real las necesita:** lista de espera; marcar si el paciente asistió o no; cierre de días por feriado; panel con citas por día, ocupación por clínica, horas pico (para decidir cuántas recepcionistas poner en cada turno) e inasistencias por médico; importación de los registros del cuaderno o de Excel.

**Lo que dejamos fuera a propósito:** una historia clínica completa (tiene requisitos legales propios; aquí solo hay una nota breve por cita) y la verificación de cédulas contra el Registro Civil (es un servicio pagado; ver §7).

## 7. La calidad de los datos

| Caso | Qué hace el sistema |
|---|---|
| Cédula con 9 dígitos, con letras o “0000000000” | La rechaza: revisa longitud, provincia, tercer dígito y el dígito verificador. Así detecta números inventados o mal copiados. Comprobar que la cédula *existe* y es *de esa persona* requiere consultar al Registro Civil; si la clínica lo contrata, se conecta en el mismo lugar. Además, dos pacientes no pueden tener la misma cédula. |
| Extranjero con pasaporte, o bebé sin documento | Se elige “Pasaporte” o “Sin documento” (con el motivo). |
| Teléfono “12345”, correo “juan@@gmail” | Se rechazan con un ejemplo del formato correcto. Ambos son opcionales: si no se tienen, se dejan vacíos. |
| Nacido en 2090 o con 300 años | Se rechaza: la fecha no puede ser futura, ni pasar de 120 años, ni ser imposible (30 de febrero). |
| “MARÍA lópez” vs “Maria Lopez” | Se guarda como “María López” y se busca sin tildes ni mayúsculas: es el mismo paciente para el buscador y para el detector de duplicados. |
| El sistema rechaza un dato | El error aparece debajo del campo y **no se borra lo escrito**. |
| Emojis, comillas o código pegado | Emojis y caracteres invisibles se quitan; nombres con números o símbolos se rechazan; nada de lo escrito se ejecuta como código. |

**Importar los registros actuales.** La pantalla “Importar datos” carga médicos, pacientes y citas desde Excel (guardado como CSV). Primero muestra una vista previa fila por fila y nada se guarda hasta confirmar. Corrige solo lo seguro y lo informa: el 0 que Excel le quita a cédulas y celulares, fechas en formato día/mes/año. Lo que no se puede saber sin inventar (año de 2 dígitos, menor sin representante, cédula de ceros, médico desconocido) se rechaza explicando qué falta. Los duplicados y las citas cruzadas del cuaderno se detectan y no se cargan.

## 8. Puesta en marcha recomendada

1. **Servidor**: uno en la nube, con un dominio (por ejemplo `agenda.clinicasparedes.ec`), para que las tres clínicas entren por internet con HTTPS (perfil `produccion`, ver INSTRUCCIONES).
2. **Respaldos**: conectar la carpeta externa (`BACKUP_COPY_PATH`) y comprobar que el panel diga “Respaldos al día”.
3. **Datos**: importar médicos, pacientes y citas futuras del cuaderno; revisar las filas rechazadas.
4. **Usuarios**: instalar con `SEED_MODE=inicial` (sin datos de demostración) y crear un usuario por persona.
5. **Capacitación**: 30 minutos con cada recepcionista. Primero agendar, buscar y cancelar; luego recordatorios.
6. **Primera semana**: el cuaderno sigue en el escritorio como plan B; cada tarde la doctora revisa el panel y la bitácora.

## 9. Supuestos (confirmar con la doctora)

| Supuesto | Motivo |
|---|---|
| Las clínicas están en Ecuador (cédula ecuatoriana, hora de Guayaquil). | El teléfono de contacto es +593. |
| Turnos de 30 min en Centro y Norte y de 20 min en Sur. | Se cambian por clínica en cualquier momento. |
| Se puede agendar hasta un año hacia adelante. | Evita errores de año (2062 por 2026). |
| El paciente puede cancelar por su enlace hasta 2 horas antes. | Para que el espacio aún se pueda ofrecer a otro paciente. |
| Los pacientes no tienen usuario en el sistema. | Solo reciben su enlace; no necesitan contraseña. |
| La Dra. Paredes es la única con rol de dirección y también atiende. | Puede crear otros usuarios de dirección si lo necesita. |

## 10. Decisiones técnicas

| Decisión | Por qué |
|---|---|
| Reglas de validación escritas una sola vez y compartidas por la web y el servidor | La cédula, el teléfono o la fecha se validan igual en ambos lados, con los mismos mensajes. |
| Reglas críticas dentro de la base de datos PostgreSQL | No cruzar citas, no borrarlas y no editar la bitácora no dependen de que el programa no tenga errores. |
| Aplicación instalable que funciona sin conexión | Por la Clínica Sur. |
| Todo empaquetado con Docker | Se instala o se mueve a otro servidor con un comando; se reinicia solo. |
| Documentación de la API (Swagger) | Si mañana se conecta otro sistema (facturación, WhatsApp Business), los programadores tienen el contrato. |
| Datos de demostración inventados | No se usan datos de personas reales para probar. |
