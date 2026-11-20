# App de Clínicas Paredes (Flutter)

App nativa de Android (e iOS más adelante) para pacientes y personal. Consume la misma API de ClinAgenda que la web: no tiene datos propios ni reglas propias, el servidor valida todo.

- **Pacientes:** inicio con su próxima cita, agendar (clínica → médico → día → hora), sus citas con comprobante en PDF y cancelar, su ficha (diagnósticos, recetas, resultados), perfil y avisos.
- **Personal** (según permisos, igual que la web): agenda del día, nueva cita, detalle de la cita (aceptar, rechazar, mover, cancelar con "Deshacer", asistió / no vino, WhatsApp, nota clínica), pacientes, ficha médica con CIE-10 y receta, recordatorios, lista de espera, clínicas y médicos, panel, usuarios, roles, bitácora, importar y sistema.
- **Accesibilidad:** leer la pantalla en voz alta (voz del teléfono), letra grande y muy grande, letra gruesa, tema claro u oscuro, alto contraste, menos movimiento. TalkBack funciona.

## Compilar el APK

No hace falta instalar Flutter: todo corre en un contenedor (`ghcr.io/cirruslabs/flutter`).

```bash
sh apps/flutter/build-apk.sh                                          # con la IP de este equipo
SERVIDOR=https://agenda.clinicasparedes.ec sh apps/flutter/build-apk.sh  # con el dominio
sh apps/flutter/flutter.sh analyze && sh apps/flutter/flutter.sh test     # revisión y pruebas
```

El APK queda en `apps/flutter/dist/`. La llave de firma (`android/clinicas-paredes.jks` y `android/keystore.properties`) no se sube al repositorio.

## Estructura

```
lib/
├── core/       api (token Bearer), sesión, servidor, fechas en hora de Quito, etiquetas, tema, accesibilidad, CIE-10
├── widgets/    componentes comunes, menú por permisos, panel de accesibilidad
└── features/   auth (ingreso, registro), portal (paciente), staff (personal)
```
